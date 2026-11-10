<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Auth\AuthService;
use Trx\Database;
use Trx\Domain\AttendanceClock;
use Trx\Domain\AttendanceToken;
use Trx\Security\Policy;
use Trx\Security\SecretBox;

/**
 * QR screens. Each screen has a server-only random secret (encrypted at rest) used to sign 6-second tokens.
 * Revoking a screen deactivates it, closes its sessions and rotates the secret, so old tokens die at once.
 */
final class AttendanceDisplayService
{
    private readonly \Closure $now;

    public function __construct(
        ?\Closure $now = null,
        private readonly SecretBox $box = new SecretBox(),
        private readonly AuditService $audit = new AuditService(),
    ) {
        $this->now = $now ?? static fn (): float => microtime(true);
    }

    /** Attendance admin (timesheet, Excel, corrections, QR screens): owner or superadmin. */
    public static function requireAdmin(array $actor): void
    {
        if (!Policy::isAdmin($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** General timesheet viewer: CRM admin (owner/superadmin) or delegated keeper. */
    public static function requireTimesheetViewer(array $actor): void
    {
        if (!Policy::isAdmin($actor) && !Policy::isKeeper($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** Secret of an active screen, or null (unknown / disabled). */
    public function secretFor(int $displayId): ?string
    {
        $stmt = Database::pdo()->prepare('SELECT secret_enc FROM attendance_displays WHERE id = ? AND is_active = 1');
        $stmt->execute([$displayId]);
        $enc = $stmt->fetchColumn();
        if (!is_string($enc) || $enc === '') {
            return null;
        }
        $raw = $this->box->decrypt($enc);

        return $raw === '' ? null : $raw;
    }

    /** @return array{token:string,epoch:int,ms_left:int,name:string} */
    public function current(array $displayUser): array
    {
        if (!Policy::isDisplay($displayUser)) {
            throw new AppException('Недостаточно прав', 403);
        }
        $stmt = Database::pdo()->prepare('SELECT id, name FROM attendance_displays WHERE user_id = ? AND is_active = 1');
        $stmt->execute([(int) $displayUser['user_id']]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $secret = $row ? $this->secretFor((int) $row['id']) : null;
        if (!$row || $secret === null) {
            throw new AppException('Экран отключён', 403);
        }
        $now = ($this->now)();
        $epoch = AttendanceClock::epoch((int) floor($now));

        return [
            'token' => AttendanceToken::make((int) $row['id'], $epoch, $secret),
            'epoch' => $epoch,
            'ms_left' => AttendanceClock::msLeft($now),
            'name' => (string) $row['name'],
        ];
    }

    /** @return list<array<string, mixed>> */
    public function list(array $actor): array
    {
        self::requireAdmin($actor);
        $rows = Database::pdo()->query(
            'SELECT d.id, d.name, d.user_id, u.username, d.is_active, d.created_at, d.revoked_at
             FROM attendance_displays d JOIN users u ON u.id = d.user_id ORDER BY d.is_active DESC, d.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(static fn (array $r): array => [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'user_id' => (int) $r['user_id'],
            'username' => $r['username'],
            'is_active' => (bool) $r['is_active'],
            'created_at' => $r['created_at'],
            'revoked_at' => $r['revoked_at'],
        ], $rows);
    }

    /** Links an existing QR-screen account to a new screen with a fresh secret. */
    public function attach(array $actor, int $userId, string $name): array
    {
        self::requireAdmin($actor);
        $name = trim($name);
        if ($name === '' || mb_strlen($name) > 128) {
            throw new AppException('Укажите название экрана');
        }
        $pdo = Database::pdo();
        $role = $pdo->prepare('SELECT r.slug FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.deleted_at IS NULL');
        $role->execute([$userId]);
        if ($role->fetchColumn() !== Policy::DISPLAY_ROLE) {
            throw new AppException('Это не учётная запись экрана QR');
        }
        $pdo->prepare('INSERT INTO attendance_displays (user_id, name, secret_enc, created_by) VALUES (?,?,?,?)')
            ->execute([$userId, $name, $this->box->encrypt(random_bytes(32)), (int) $actor['user_id']]);
        $id = (int) $pdo->lastInsertId();
        $this->audit->log((int) $actor['user_id'], 'attendance_display', (string) $id, 'create', null, ['name' => $name, 'user_id' => $userId]);

        return ['id' => $id, 'name' => $name, 'user_id' => $userId, 'is_active' => true];
    }

    /**
     * Creates the QR-screen login (no modules, role attendance_display) and its screen.
     * The initial password is typed by the owner (generated and kept via the vault); it is never logged or returned.
     *
     * @param array<string, mixed> $input
     */
    public function createAccount(array $actor, array $input): array
    {
        self::requireAdmin($actor);
        $name = trim((string) ($input['name'] ?? ''));
        $username = mb_strtolower(trim((string) ($input['username'] ?? '')));
        $pass = (string) ($input['password'] ?? '');
        if ($name === '' || mb_strlen($name) > 128) {
            throw new AppException('Укажите название экрана');
        }
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
            throw new AppException('Логин: 3–32 символа, латиница, цифры, точка, _ или -');
        }
        if (mb_strlen($pass) < AuthService::MIN_PASSWORD_LENGTH) {
            throw new AppException('Пароль должен быть не короче ' . AuthService::MIN_PASSWORD_LENGTH . ' символов');
        }
        $pdo = Database::pdo();
        $email = $username . '@demo.local';
        $taken = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
        $taken->execute([$username, $email]);
        if ($taken->fetchColumn()) {
            throw new AppException('Такой логин уже занят');
        }
        $roleId = (int) $pdo->query("SELECT id FROM roles WHERE slug = 'attendance_display'")->fetchColumn();
        if ($roleId <= 0) {
            throw new AppException('Роль экрана не найдена', 500);
        }
        $pdo->prepare(
            'INSERT INTO users (email, username, password_hash, must_change_password, name, initials, role_id, is_active)
             VALUES (?, ?, ?, 0, ?, ?, ?, 1)'
        )->execute([$email, $username, password_hash($pass, PASSWORD_DEFAULT), $name, 'QR', $roleId]);
        $userId = (int) $pdo->lastInsertId();
        $this->audit->log((int) $actor['user_id'], 'user', (string) $userId, 'display_account_created', null, ['username' => $username]);

        return $this->attach($actor, $userId, $name) + ['username' => $username];
    }

    public function revoke(array $actor, int $displayId): void
    {
        self::requireAdmin($actor);
        $pdo = Database::pdo();
        $row = $pdo->prepare('SELECT user_id FROM attendance_displays WHERE id = ?');
        $row->execute([$displayId]);
        $userId = $row->fetchColumn();
        if ($userId === false) {
            throw new AppException('Экран не найден', 404);
        }
        $pdo->prepare('UPDATE attendance_displays SET is_active = 0, revoked_at = NOW(), secret_enc = ? WHERE id = ?')
            ->execute([$this->box->encrypt(random_bytes(32)), $displayId]);
        // The screen login itself stops working too (no re-enable flow: create a new screen instead).
        $pdo->prepare('UPDATE users SET is_active = 0 WHERE id = ?')->execute([(int) $userId]);
        $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([(int) $userId]);
        $this->audit->log((int) $actor['user_id'], 'attendance_display', (string) $displayId, 'revoke', null, null);
    }
}
