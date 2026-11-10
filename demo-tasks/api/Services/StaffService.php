<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Auth\AuthService;
use Trx\Database;
use Trx\Security\Policy;

final class StaffService
{
    public function __construct(
        private readonly AuthService $auth = new AuthService(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * @param array<string, mixed> $actor
     * @return list<array<string, mixed>>
     */
    public function list(array $actor): array
    {
        $this->assertOwner($actor);
        // QR screen accounts are managed only in «Посещаемость → Экраны QR», never as staff.
        $hide = ' WHERE r.slug <> ' . Database::pdo()->quote(Policy::DISPLAY_ROLE)
            . (Policy::isSuperadmin($actor) ? '' : ' AND ' . Policy::hideSuperadminSql('u'));
        $rows = Database::pdo()->query(
            'SELECT u.id, u.name, u.username, u.email, u.initials, u.phone, u.is_active, u.deleted_at, u.must_change_password, u.see_all_tasks, u.position,
                    r.slug AS role_slug, r.name AS role_name
             FROM users u
             JOIN roles r ON r.id = u.role_id' . $hide . '
             ORDER BY u.deleted_at IS NOT NULL, u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];
        foreach ($rows as $row) {
            $out[] = $this->present($row);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $actor, array $input): array
    {
        $this->assertOwner($actor);
        $name = trim((string) ($input['name'] ?? ''));
        $username = mb_strtolower(trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($name === '' || mb_strlen($name) > 128) {
            throw new AppException('Укажите имя');
        }
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $username)) {
            throw new AppException('Логин: 3–32 символа, латиница, цифры, точка, _ или -');
        }
        if (mb_strlen($password) < AuthService::MIN_PASSWORD_LENGTH) {
            throw new AppException('Начальный пароль должен быть не короче ' . AuthService::MIN_PASSWORD_LENGTH . ' символов');
        }
        $modules = $this->modulesFrom($input['modules'] ?? []);
        $pdo = Database::pdo();
        $taken = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
        $email = $username . '@demo.local';
        $taken->execute([$username, $email]);
        if ($taken->fetchColumn()) {
            throw new AppException('Такой логин уже занят');
        }
        $roleId = (int) $pdo->query("SELECT id FROM roles WHERE slug = 'employee'")->fetchColumn();
        if ($roleId <= 0) {
            throw new AppException('Роль сотрудника не найдена', 500);
        }
        $initials = $this->initials($name);
        $pdo->prepare(
            'INSERT INTO users (email, username, password_hash, must_change_password, name, initials, role_id, is_active)
             VALUES (?, ?, ?, 1, ?, ?, ?, 1)'
        )->execute([$email, $username, password_hash($password, PASSWORD_DEFAULT), $name, $initials, $roleId]);
        $id = (int) $pdo->lastInsertId();
        $this->replaceModules($id, $modules);
        $this->audit->log((int) $actor['user_id'], 'user', (string) $id, 'staff_created', null, ['username' => $username, 'modules' => $modules]);

        return $this->present($this->row($id));
    }

    /**
     * @param array<string, mixed> $actor
     * @param list<mixed> $modules
     * @return array<string, mixed>
     */
    public function updateModules(array $actor, int $id, array $modules, ?bool $seeAllTasks = null): array
    {
        $fields = ['modules' => $modules];
        if ($seeAllTasks !== null) {
            $fields['see_all_tasks'] = $seeAllTasks;
        }

        return $this->update($actor, $id, $fields);
    }

    /** @param array<string, mixed> $actor @return array<string, mixed> */
    public function updatePosition(array $actor, int $id, mixed $position): array
    {
        return $this->update($actor, $id, ['position' => $position]);
    }

    /**
     * Single PATCH /staff/{id} entry point. Every supplied field is validated and the target is checked
     * BEFORE any write; then position, modules (+ keeper revocation when «attendance» is dropped),
     * see_all_tasks and their audit rows commit in ONE transaction (or roll back together).
     * Transaction ownership: with no open transaction this method owns it (commit, or rollback on any exception).
     * If the caller already has a transaction open, atomically() joins it without a savepoint: nothing is rolled
     * back here on an exception, and the caller owns rollback of its transaction (incl. this call's writes).
     * Fields: position (string|null, trimmed, ≤128, empty → NULL), modules (list of strings; unknown names are
     * filtered as before), see_all_tasks (bool|0|1|'0'|'1', only together with modules).
     * Target rules: superadmin/QR screen → 403; deleted → 400 for any field; owner → 400 when modules are
     * supplied (owner has every module), position-only on the owner is allowed.
     *
     * @param array<string, mixed> $actor
     * @param array<string, mixed> $fields
     * @return array<string, mixed>
     */
    public function update(array $actor, int $id, array $fields): array
    {
        $this->assertOwner($actor);
        $hasPosition = array_key_exists('position', $fields);
        $hasModules = array_key_exists('modules', $fields);
        $hasSeeAll = array_key_exists('see_all_tasks', $fields);
        if (!$hasPosition && !$hasModules) {
            throw new AppException('Укажите список модулей', 422);
        }
        $position = null;
        if ($hasPosition) {
            $raw = $fields['position'];
            if ($raw !== null && !is_string($raw)) {
                throw new AppException('Должность должна быть строкой', 422);
            }
            $position = $raw === null ? '' : trim($raw);
            if (mb_strlen($position) > 128) {
                throw new AppException('Должность: до 128 символов', 422);
            }
            $position = $position === '' ? null : $position;
        }
        $clean = null;
        if ($hasModules) {
            $mods = $fields['modules'];
            if (!is_array($mods) || !array_is_list($mods)) {
                throw new AppException('Укажите список модулей', 422);
            }
            foreach ($mods as $m) {
                if (!is_string($m)) {
                    throw new AppException('Модули должны быть строками', 422);
                }
            }
            $clean = $this->modulesFrom($mods);
        }
        $seeAll = null;
        if ($hasSeeAll) {
            $v = $fields['see_all_tasks'];
            if (!$hasModules || !in_array($v, [true, false, 0, 1, '0', '1'], true)) {
                throw new AppException('see_all_tasks: true/false вместе со списком модулей', 422);
            }
            $seeAll = $v === true || $v === 1 || $v === '1';
        }

        $row = $this->row($id);
        $this->assertNotSuperadmin($row);
        if (!empty($row['deleted_at'])) {
            throw new AppException('Удалённому сотруднику нельзя менять доступ');
        }
        if ($hasModules && ($row['role_slug'] ?? '') === 'owner') {
            throw new AppException('У владельца доступны все модули');
        }

        $actorId = (int) $actor['user_id'];
        $pdo = Database::pdo();
        $this->atomically(function () use ($pdo, $id, $actorId, $row, $hasPosition, $position, $clean, $seeAll): void {
            if ($hasPosition) {
                $pdo->prepare('UPDATE users SET position = ? WHERE id = ?')->execute([$position, $id]);
                $this->audit->log($actorId, 'user', (string) $id, 'position_changed', ['position' => $row['position'] ?? null], ['position' => $position]);
            }
            if ($clean !== null) {
                $this->replaceModules($id, $clean); // joins this transaction
                if ($seeAll !== null) {
                    $pdo->prepare('UPDATE users SET see_all_tasks = ? WHERE id = ?')->execute([$seeAll ? 1 : 0, $id]);
                }
                $payload = ['modules' => $clean];
                if ($seeAll !== null) {
                    $payload['see_all_tasks'] = $seeAll;
                }
                $this->audit->log($actorId, 'user', (string) $id, 'modules_changed', null, $payload);
            }
        });
        Policy::clearCache();

        return $this->present($this->row($id));
    }

    /** @param array<string, mixed> $actor */
    public function remove(array $actor, int $id): array
    {
        $this->assertOwner($actor);
        $actorId = (int) $actor['user_id'];
        if ($id === $actorId) {
            throw new AppException('Нельзя удалить свою учётную запись');
        }
        $row = $this->row($id);
        $this->assertNotSuperadmin($row);
        if (!empty($row['deleted_at'])) {
            throw new AppException('Сотрудник уже удалён');
        }
        if (($row['role_slug'] ?? '') === 'owner') {
            $owners = (int) Database::pdo()->query(
                "SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id
                 WHERE r.slug = 'owner' AND u.is_active = 1 AND u.deleted_at IS NULL"
            )->fetchColumn();
            if ($owners <= 1) {
                throw new AppException('В системе должен остаться хотя бы один владелец');
            }
        }
        $pdo = Database::pdo();
        $this->atomically(static function () use ($pdo, $id): void {
            $pdo->prepare('UPDATE users SET is_active = 0, deleted_at = NOW() WHERE id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([$id]);
            $pdo->prepare('DELETE FROM attendance_keepers WHERE user_id = ?')->execute([$id]); // spec §9: deletion revokes «Табельщик»
        });
        Policy::clearCache();
        $this->audit->log($actorId, 'user', (string) $id, 'staff_deleted', ['name' => $row['name']], null);

        return $this->present($this->row($id));
    }

    /** @param array<string, mixed> $actor */
    public function resetPassword(array $actor, int $id, string $password, string $ip): void
    {
        $this->assertOwner($actor);
        if ($id === (int) $actor['user_id']) {
            throw new AppException('Свой пароль меняйте в блоке «Смена пароля»');
        }
        $row = $this->row($id);
        $this->assertNotSuperadmin($row);
        if (!empty($row['deleted_at'])) {
            throw new AppException('Удалённому сотруднику нельзя сбросить пароль');
        }
        $result = $this->auth->resetPassword((int) $actor['user_id'], $id, $password, $ip);
        if (!$result['ok']) {
            throw new AppException((string) ($result['error'] ?? 'Не удалось сбросить пароль'));
        }
    }

    /** @param array<string, mixed> $actor */
    private function assertOwner(array $actor): void
    {
        if (($actor['role_slug'] ?? '') !== 'owner') {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @param array<string, mixed> $row */
    private function assertNotSuperadmin(array $row): void
    {
        if (($row['role_slug'] ?? '') === Policy::SUPERADMIN) {
            throw new AppException('Эту учётную запись нельзя изменять', 403);
        }
        if (($row['role_slug'] ?? '') === Policy::DISPLAY_ROLE) {
            throw new AppException('Экран QR меняется только в «Посещаемость → Экраны QR»', 403);
        }
    }

    /** @param list<mixed> $modules @return list<string> */
    private function modulesFrom(array $modules): array
    {
        $clean = [];
        foreach ($modules as $module) {
            if (is_string($module) && in_array($module, Policy::MODULES, true) && !Policy::isOwnerOnlyModule($module) && !in_array($module, $clean, true)) {
                $clean[] = $module;
            }
        }

        return $clean;
    }

    /** @param list<string> $modules */
    private function replaceModules(int $userId, array $modules): void
    {
        $pdo = Database::pdo();
        $this->atomically(static function () use ($pdo, $userId, $modules): void {
            $pdo->prepare('DELETE FROM user_modules WHERE user_id = ?')->execute([$userId]);
            $insert = $pdo->prepare('INSERT INTO user_modules (user_id, module) VALUES (?, ?)');
            foreach ($modules as $module) {
                $insert->execute([$userId, $module]);
            }
            if (!in_array('attendance', $modules, true)) {
                $pdo->prepare('DELETE FROM attendance_keepers WHERE user_id = ?')->execute([$userId]); // spec §9: losing the module revokes «Табельщик»
            }
        });
        Policy::clearCache();
    }

    /** Runs $fn in its own transaction, or inside the caller's one if already open (no nested BEGIN). */
    private function atomically(\Closure $fn): void
    {
        $pdo = Database::pdo();
        if ($pdo->inTransaction()) {
            $fn();

            return;
        }
        $pdo->beginTransaction();
        try {
            $fn();
            $pdo->commit();
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /** @return array<string, mixed> */
    private function row(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id, u.name, u.username, u.email, u.initials, u.phone, u.is_active, u.deleted_at, u.must_change_password, u.see_all_tasks, u.position,
                    r.slug AS role_slug, r.name AS role_name
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Сотрудник не найден', 404);
        }

        return $row;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        $id = (int) $row['id'];
        $stmt = Database::pdo()->prepare('SELECT module FROM user_modules WHERE user_id = ? ORDER BY module');
        $stmt->execute([$id]);
        $modules = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
        $deleted = !empty($row['deleted_at']);

        return [
            'id' => $id,
            'name' => (string) $row['name'],
            'display_name' => Policy::personName((string) $row['name'], $deleted ? $row['deleted_at'] : null),
            'username' => $row['username'],
            'email' => (string) $row['email'],
            'initials' => (string) $row['initials'],
            'phone' => $row['phone'],
            'role' => (string) $row['role_slug'],
            'role_name' => (string) $row['role_name'],
            'is_active' => (int) $row['is_active'] === 1 && !$deleted,
            'deleted' => $deleted,
            'must_change_password' => (int) $row['must_change_password'] === 1,
            'modules' => in_array($row['role_slug'] ?? '', ['owner', Policy::SUPERADMIN], true) ? Policy::MODULES : array_values(array_map('strval', $modules)),
            'see_all_tasks' => in_array($row['role_slug'] ?? '', ['owner', Policy::SUPERADMIN], true) || (int) ($row['see_all_tasks'] ?? 0) === 1,
            'position' => isset($row['position']) && $row['position'] !== '' ? (string) $row['position'] : null,
        ];
    }

    private function initials(string $name): string
    {
        $parts = preg_split('/\s+/u', trim($name)) ?: [];
        $letters = '';
        foreach ($parts as $part) {
            if ($part === '') {
                continue;
            }
            $letters .= mb_substr($part, 0, 1);
            if (mb_strlen($letters) >= 2) {
                break;
            }
        }
        if ($letters === '') {
            $letters = mb_substr(trim($name), 0, 2);
        }

        return mb_strtoupper($letters);
    }
}
