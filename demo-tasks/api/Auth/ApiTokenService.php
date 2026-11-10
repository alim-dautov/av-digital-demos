<?php

declare(strict_types=1);

namespace Trx\Auth;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use Trx\Config;
use Trx\Database;
use Trx\Http\Request;
use Trx\Services\AppException;
use Trx\Services\AuditService;

/**
 * Bearer tokens for an external assistant.
 * The plaintext secret is returned once at creation and is never stored or logged.
 * A token is 256 bits of randomness, so sha256 is the stored lookup key.
 */
final class ApiTokenService
{
    private const PREFIX_LENGTH = 12;

    /** Token scopes. "full" = everything the bound user can do (old tokens). "kp" = only /api/kp*. */
    public const SCOPES = ['full', 'kp'];

    public function __construct(
        private readonly AuditService $audit = new AuditService(),
        private readonly int $successPerMinute = 120,
        private readonly int $failuresPerMinute = 30,
    ) {
    }

    /**
     * Bearer secret, or null when the request is not trying token auth.
     * An empty string means the header was present but unusable.
     */
    public function bearerToken(Request $request): ?string
    {
        $header = $request->header('authorization');
        if (!is_string($header) || !preg_match('/^Bearer\b/i', $header)) {
            return null;
        }
        if (!preg_match('/^Bearer\s+(\S+)\s*$/i', $header, $matches)) {
            return '';
        }

        return $matches[1];
    }

    /**
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $actor, array $input, string $ip): array
    {
        $this->assertOwner($actor);
        $name = $this->name($input['name'] ?? '');
        $userId = (int) ($input['user_id'] ?? 0);
        $expiresAt = $this->parseExpiry($input['expires_at'] ?? null);
        $scope = (string) ($input['scope'] ?? 'full');
        if (!in_array($scope, self::SCOPES, true)) {
            throw new AppException('Неизвестная область доступа токена', 422);
        }
        if ($scope !== 'kp' && $this->kpOnly($actor)) {
            throw new AppException('Суперадмин может выпускать только токены «Только КП»', 403);
        }

        $pdo = Database::pdo();
        $user = $pdo->prepare('SELECT id, name, is_active FROM users WHERE id = ? LIMIT 1');
        $user->execute([$userId]);
        $bound = $user->fetch(PDO::FETCH_ASSOC);
        if (!$bound || !(int) $bound['is_active']) {
            throw new AppException('Сотрудник не найден', 422);
        }

        $plain = 'demo_' . bin2hex(random_bytes(32));
        $hash = hash('sha256', $plain);
        $prefix = substr($plain, 0, self::PREFIX_LENGTH);
        $pdo->prepare(
            'INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, created_by, expires_at, scope)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $userId,
            $name,
            $hash,
            $prefix,
            (int) $actor['user_id'],
            $expiresAt,
            $scope,
        ]);
        $id = (int) $pdo->lastInsertId();
        $this->audit->log((int) $actor['user_id'], 'api_token', (string) $id, 'create', null, [
            'name' => $name,
            'user_id' => $userId,
            'prefix' => $prefix,
            'scope' => $scope,
            'expires_at' => $expiresAt,
        ], $this->ip($ip));

        $row = $this->present($this->fetch($id));
        $row['token'] = $plain;

        return $row;
    }

    /**
     * @param array<string, mixed> $actor
     * @return list<array<string, mixed>>
     */
    public function list(array $actor): array
    {
        $this->assertOwner($actor);
        $rows = Database::pdo()->query(
            'SELECT t.id, t.name, t.token_prefix, t.user_id, u.name AS user_name,
                    t.scope, t.created_at, t.last_used_at, t.expires_at, t.revoked_at
             FROM api_tokens t
             JOIN users u ON u.id = t.user_id'
            . ($this->kpOnly($actor) ? " WHERE t.scope = 'kp'" : '') . '
             ORDER BY (t.revoked_at IS NOT NULL), t.id DESC'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(fn (array $row): array => $this->present($row), $rows);
    }

    /**
     * @param array<string, mixed> $actor
     * @return array<string, mixed>
     */
    public function revoke(array $actor, int $id, string $ip): array
    {
        $this->assertOwner($actor);
        $current = $this->fetchForActor($actor, $id);
        if ($current['revoked_at'] === null) {
            Database::pdo()->prepare(
                'UPDATE api_tokens SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL'
            )->execute([$id]);
            $this->audit->log((int) $actor['user_id'], 'api_token', (string) $id, 'revoke', null, [
                'name' => $current['name'],
                'prefix' => $current['token_prefix'],
            ], $this->ip($ip));
            $current = $this->fetch($id);
        }

        return $this->present($current);
    }

    /**
     * Hard-deletes a token row, but only once it is revoked. Active tokens get 409.
     *
     * @param array<string, mixed> $actor
     * @return array{deleted: int}
     */
    public function delete(array $actor, int $id, string $ip): array
    {
        $this->assertOwner($actor);
        $current = $this->fetchForActor($actor, $id);
        if ($current['revoked_at'] === null) {
            throw new AppException('Сначала отзовите токен, удалить можно только отозванный', 409);
        }
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('DELETE FROM api_tokens WHERE id = ? AND revoked_at IS NOT NULL');
        $stmt->execute([$id]);
        if ($stmt->rowCount() !== 1) {
            throw new AppException('Сначала отзовите токен, удалить можно только отозванный', 409);
        }
        $pdo->prepare('DELETE FROM api_rate_limits WHERE bucket IN (?, ?)')->execute(['tok:' . $id, 'mcp:' . $id]);
        $this->audit->log((int) $actor['user_id'], 'api_token', (string) $id, 'delete', null, [
            'name' => $current['name'],
            'prefix' => $current['token_prefix'],
        ], $this->ip($ip));

        return ['deleted' => $id];
    }

    /**
     * @return array{user: ?array<string, mixed>, status: int, error: string, retry_after: int}
     */
    public function authenticate(string $token, string $ip): array
    {
        $token = trim($token);
        if ($token === '' || strlen($token) > 200) {
            return $this->reject($ip);
        }

        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            'SELECT t.id, t.user_id, t.name, t.scope, t.revoked_at, u.is_active,
                    (t.expires_at IS NOT NULL AND t.expires_at <= NOW()) AS expired
             FROM api_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ?
             LIMIT 1'
        );
        $stmt->execute([hash('sha256', $token)]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row['revoked_at'] !== null || (int) $row['expired'] === 1 || !(int) $row['is_active']) {
            return $this->reject($ip);
        }

        $tokenId = (int) $row['id'];
        if (!$this->allow('tok:' . $tokenId, $this->successPerMinute)) {
            return [
                'user' => null,
                'status' => 429,
                'error' => 'Слишком много запросов. Попробуйте через минуту.',
                'retry_after' => 60,
            ];
        }

        $pdo->prepare('UPDATE api_tokens SET last_used_at = NOW() WHERE id = ?')->execute([$tokenId]);
        $user = $this->loadUser((int) $row['user_id']);
        if ($user === null) {
            return $this->reject($ip);
        }

        $scope = in_array((string) $row['scope'], self::SCOPES, true) ? (string) $row['scope'] : 'full';
        $user['token_id'] = $tokenId;
        $user['token_name'] = (string) $row['name'];
        $user['token_scope'] = $scope;

        return ['user' => $user, 'status' => 200, 'error' => '', 'retry_after' => 0, 'token_id' => $tokenId, 'scope' => $scope];
    }

    /** @param array<string, mixed> $actor */
    private function assertOwner(array $actor): void
    {
        // Owner or superadmin. Full tokens (MCP/Grok) stay real-owner only: see kpOnly().
        if (!\Trx\Security\Policy::isAdmin($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** Superadmin manages only KP-only tokens (/api/kp*); full tokens are the Grok/MCP path and stay Aziz-only. */
    private function kpOnly(array $actor): bool
    {
        return !\Trx\Security\Policy::isRealOwner($actor);
    }

    /** Same answer for unknown ids and full tokens, so ids of full tokens cannot be probed. */
    private function fetchForActor(array $actor, int $id): array
    {
        if ($this->kpOnly($actor)) {
            $stmt = Database::pdo()->prepare('SELECT scope FROM api_tokens WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->fetchColumn() !== 'kp') {
                throw new AppException('Недостаточно прав', 403);
            }
        }

        return $this->fetch($id);
    }

    private function name(mixed $value): string
    {
        $name = trim(preg_replace('/\s+/u', ' ', is_string($value) ? $value : '') ?? '');
        if ($name === '' || mb_strlen($name) > 128) {
            throw new AppException('Укажите название токена до 128 символов', 422);
        }

        return $name;
    }

    private function parseExpiry(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value)) {
            throw new AppException('Некорректный срок действия', 422);
        }
        $value = trim($value);
        $tz = new DateTimeZone((string) Config::get('app.timezone', 'Asia/Almaty'));
        foreach (['Y-m-d\TH:i', 'Y-m-d\TH:i:s', 'Y-m-d H:i:s', 'Y-m-d H:i', 'Y-m-d'] as $format) {
            $dt = DateTimeImmutable::createFromFormat($format, $value, $tz);
            $errors = DateTimeImmutable::getLastErrors();
            if (!$dt instanceof DateTimeImmutable) {
                continue;
            }
            if (is_array($errors) && (($errors['warning_count'] ?? 0) > 0 || ($errors['error_count'] ?? 0) > 0)) {
                continue;
            }
            if ($format === 'Y-m-d') {
                $dt = $dt->setTime(23, 59, 59);
            }
            if ($dt <= new DateTimeImmutable('now', $tz)) {
                throw new AppException('Срок действия должен быть в будущем', 422);
            }

            return $dt->format('Y-m-d H:i:s');
        }

        throw new AppException('Некорректный срок действия', 422);
    }

    /** @return array<string, mixed> */
    private function fetch(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.name, t.token_prefix, t.user_id, u.name AS user_name,
                    t.scope, t.created_at, t.last_used_at, t.expires_at, t.revoked_at
             FROM api_tokens t
             JOIN users u ON u.id = t.user_id
             WHERE t.id = ?
             LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Токен не найден', 404);
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'prefix' => (string) $row['token_prefix'],
            'user_id' => (int) $row['user_id'],
            'user_name' => (string) $row['user_name'],
            'scope' => (string) ($row['scope'] ?? 'full'),
            'created_at' => (string) $row['created_at'],
            'last_used_at' => $row['last_used_at'] !== null ? (string) $row['last_used_at'] : null,
            'expires_at' => $row['expires_at'] !== null ? (string) $row['expires_at'] : null,
            'revoked_at' => $row['revoked_at'] !== null ? (string) $row['revoked_at'] : null,
        ];
    }

    /** @return array<string, mixed>|null */
    private function loadUser(int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id AS user_id, u.email, u.username, u.name, u.initials, u.phone,
                    u.must_change_password, u.is_active, u.totp_enabled, u.department_id, u.see_all_tasks,
                    r.slug AS role_slug, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = ? AND u.is_active = 1
             LIMIT 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }
        // Token auth has no browser session. Password change closes every session.
        $row['id'] = '';

        return \Trx\Security\Policy::normalizeRole($row);
    }

    /** @return array{user: null, status: int, error: string, retry_after: int} */
    private function reject(string $ip): array
    {
        if (!$this->allow('fail:' . $this->ip($ip), $this->failuresPerMinute)) {
            return [
                'user' => null,
                'status' => 429,
                'error' => 'Слишком много запросов. Попробуйте через минуту.',
                'retry_after' => 60,
            ];
        }

        return ['user' => null, 'status' => 401, 'error' => 'Недействительный токен', 'retry_after' => 0];
    }

    private function allow(string $bucket, int $limit): bool
    {
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO api_rate_limits (bucket, hits, reset_at)
             VALUES (?, 1, DATE_ADD(NOW(), INTERVAL 60 SECOND))
             ON DUPLICATE KEY UPDATE
                hits = IF(reset_at <= NOW(), 1, hits + 1),
                reset_at = IF(reset_at <= NOW(), DATE_ADD(NOW(), INTERVAL 60 SECOND), reset_at)'
        )->execute([$bucket]);
        $stmt = $pdo->prepare('SELECT hits FROM api_rate_limits WHERE bucket = ?');
        $stmt->execute([$bucket]);

        return (int) $stmt->fetchColumn() <= $limit;
    }

    private function ip(string $ip): string
    {
        $ip = trim($ip);
        if ($ip === '') {
            return '0.0.0.0';
        }

        return substr($ip, 0, 45);
    }
}
