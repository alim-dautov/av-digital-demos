<?php

declare(strict_types=1);

namespace Trx\Auth;

use PDO;
use Trx\Config;
use Trx\Database;
use Trx\Services\AuditService;

final class AuthService
{
    public const MIN_PASSWORD_LENGTH = 8;

    public function __construct(
        private readonly SessionService $sessions = new SessionService(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /** @return array{ok: bool, error?: string, needs_totp?: bool, user?: array<string, mixed>, csrf_token?: string} */
    public function login(string $login, string $password, ?string $totpCode, string $ip, string $ua): array
    {
        $login = mb_strtolower(trim($login));
        if ($login === '' || $password === '') {
            return ['ok' => false, 'error' => 'Укажите логин и пароль'];
        }

        if ($this->isLocked($login, $ip)) {
            return ['ok' => false, 'error' => 'Слишком много попыток. Попробуйте позже.'];
        }

        $column = str_contains($login, '@') ? 'u.email' : 'u.username';
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            "SELECT u.*, r.slug AS role_slug, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id
             WHERE {$column} = ? LIMIT 1"
        );
        $stmt->execute([$login]);
        $user = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($user) {
            $user = \Trx\Security\Policy::normalizeRole($user);
        }

        if (!$user || !(int) $user['is_active'] || !password_verify($password, $user['password_hash'])) {
            $this->recordAttempt($login, $ip, false);

            return ['ok' => false, 'error' => 'Неверный логин или пароль'];
        }

        // 2FA отключена; параметр $totpCode сохранён для совместимости API.
        $this->recordAttempt($login, $ip, true);
        $session = $this->sessions->create((int) $user['id'], $ip, $ua);
        Database::pdo()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([(int) $user['id']]);
        $this->audit->log((int) $user['id'], 'user', (string) $user['id'], 'login', null, ['ip' => $ip], $ip);

        return [
            'ok' => true,
            'csrf_token' => $session['csrf_token'],
            'user' => $this->publicUser($user),
        ];
    }

    public function logout(?string $sessionId, ?int $userId, string $ip): void
    {
        if ($userId) {
            $this->audit->log($userId, 'user', (string) $userId, 'logout', null, null, $ip);
        }
        $this->sessions->destroy($sessionId);
    }

    /** @param array<string, mixed> $user */
    public function publicUser(array $user): array
    {
        return [
            'id' => (int) ($user['user_id'] ?? $user['id']),
            'email' => $user['email'],
            'username' => $user['username'] ?? null,
            'name' => $user['name'],
            'initials' => $user['initials'],
            'phone' => $user['phone'] ?? null,
            'must_change_password' => (bool) ($user['must_change_password'] ?? false),
            'role' => $user['role_slug'] ?? $user['role'] ?? null,
            'role_name' => $user['role_name'] ?? null,
            'department_id' => isset($user['department_id']) ? (int) $user['department_id'] : null,
            'see_all_tasks' => ($user['role_slug'] ?? $user['role'] ?? '') === 'owner' || $user['see_all_tasks'] === true || (int) ($user['see_all_tasks'] ?? 0) === 1,
            'totp_enabled' => (bool) ($user['totp_enabled'] ?? false),
            'is_superadmin' => ($user['is_superadmin'] ?? false) === true,
        ];
    }

    /** @return array{ok: bool, error?: string} */
    public function changePassword(int $userId, string $sessionId, string $current, string $new, string $ip): array
    {
        if (mb_strlen($new) < self::MIN_PASSWORD_LENGTH) {
            return ['ok' => false, 'error' => 'Новый пароль должен быть не короче ' . self::MIN_PASSWORD_LENGTH . ' символов'];
        }
        if ($new === $current) {
            return ['ok' => false, 'error' => 'Новый пароль должен отличаться от текущего'];
        }

        $pdo = Database::pdo();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $hash = $stmt->fetchColumn();
        if (!is_string($hash) || !password_verify($current, $hash)) {
            return ['ok' => false, 'error' => 'Текущий пароль указан неверно'];
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
                ->execute([password_hash($new, PASSWORD_DEFAULT), $userId]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?')->execute([$userId, $sessionId]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        $this->audit->log($userId, 'user', (string) $userId, 'password_changed', null, null, $ip);

        return ['ok' => true];
    }

    /**
     * Owner reset: the person must set their own password on the next login.
     * Every existing session is closed.
     *
     * @return array{ok: bool, error?: string}
     */
    public function resetPassword(int $actorId, int $userId, string $new, string $ip): array
    {
        if (mb_strlen($new) < self::MIN_PASSWORD_LENGTH) {
            return ['ok' => false, 'error' => 'Новый пароль должен быть не короче ' . self::MIN_PASSWORD_LENGTH . ' символов'];
        }
        $pdo = Database::pdo();
        $target = $pdo->prepare('SELECT r.slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?');
        $target->execute([$userId]);
        if ($target->fetchColumn() === \Trx\Security\Policy::SUPERADMIN && $actorId !== $userId) {
            return ['ok' => false, 'error' => 'Эту учётную запись нельзя изменять'];
        }
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?')
                ->execute([password_hash($new, PASSWORD_DEFAULT), $userId]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$userId]);
            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        $this->audit->log($actorId, 'user', (string) $userId, 'password_reset', null, null, $ip);

        return ['ok' => true];
    }

    private function isLocked(string $email, string $ip): bool
    {
        $max = (int) Config::get('auth.max_login_attempts', 5);
        $minutes = (int) Config::get('auth.lockout_minutes', 15);
        $stmt = Database::pdo()->prepare(
            'SELECT COUNT(*) FROM login_attempts
             WHERE email = ? AND success = 0 AND created_at > (NOW() - INTERVAL ? MINUTE)'
        );
        $stmt->execute([$email, $minutes]);

        return (int) $stmt->fetchColumn() >= $max;
    }

    private function recordAttempt(string $email, string $ip, bool $success): void
    {
        $stmt = Database::pdo()->prepare(
            'INSERT INTO login_attempts (email, ip, success) VALUES (?, ?, ?)'
        );
        $stmt->execute([$email, $ip, $success ? 1 : 0]);
    }
}
