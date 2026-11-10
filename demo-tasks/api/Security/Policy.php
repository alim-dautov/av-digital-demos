<?php

declare(strict_types=1);

namespace Trx\Security;

use PDO;
use Trx\Database;

final class Policy
{
    /** @var list<string> */
    public const MODULES = ['dashboard', 'tasks', 'sales', 'team', 'warehouse', 'reports', 'agent', 'bot', 'whatsapp', 'kp', 'kpi', 'analytics', 'attendance'];

    /** @var array<int, list<string>> */
    private static array $cache = [];

    public const SUPERADMIN = 'superadmin';

    /** QR screen account: shows the attendance QR only, no CRM modules and no owner rights. */
    public const DISPLAY_ROLE = 'attendance_display';

    /** @param array<string, mixed> $user */
    public static function isDisplay(array $user): bool
    {
        return ($user['role_slug'] ?? '') === self::DISPLAY_ROLE;
    }

    /** Server-side allowlist for the QR screen role (applies to every path, including module-less ones). */
    public static function displayAllows(string $method, string $path): bool
    {
        $path = rtrim($path, '/') ?: '/';

        return ($method === 'GET' && ($path === '/attendance/display/current' || $path === '/me'))
            || ($method === 'POST' && $path === '/auth/logout');
    }

    /**
     * Modules only the owner (and the hidden superadmin) may use. A grant in user_modules
     * or in the team settings never opens them for anyone else.
     *
     * @var list<string>
     */
    public const OWNER_ONLY_MODULES = ['agent'];

    public static function isOwnerOnlyModule(string $module): bool
    {
        return in_array($module, self::OWNER_ONLY_MODULES, true);
    }

    /**
     * The real owner (role «Владелец»). The hidden superadmin is mapped to owner by normalizeRole()
     * but is NOT the real owner, so owner-only modules (Grok Bot) stay closed for it.
     *
     * @param array<string, mixed> $user
     */
    public static function isRealOwner(array $user): bool
    {
        return ($user['role_slug'] ?? '') === 'owner' && !self::isSuperadmin($user);
    }

    /**
     * CRM administrator: the real owner or the hidden superadmin (full access to every non-Grok module and admin page).
     * Grok Bot is checked separately with isRealOwner().
     *
     * @param array<string, mixed> $user
     */
    public static function isAdmin(array $user): bool
    {
        return ($user['role_slug'] ?? '') === 'owner' && !self::isDisplay($user);
    }

    /**
     * SQL condition that hides superadmin accounts from user lists.
     * Safe when the role row is missing (empty subquery keeps every user).
     */
    public static function hideSuperadminSql(string $alias = 'u'): string
    {
        return $alias . ".role_id NOT IN (SELECT sa_r.id FROM roles sa_r WHERE sa_r.slug = 'superadmin')";
    }

    /**
     * Superadmin acts as owner everywhere. The real role stays in is_superadmin.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function normalizeRole(array $row): array
    {
        $row['is_superadmin'] = ($row['role_slug'] ?? '') === self::SUPERADMIN;
        if ($row['is_superadmin']) {
            $row['role_slug'] = 'owner';
        }

        return $row;
    }

    /** @param array<string, mixed> $user */
    public static function isSuperadmin(array $user): bool
    {
        return ($user['is_superadmin'] ?? false) === true;
    }

    /** @param array<string, mixed> $user */
    public function can(array $user, string $resource, string $action): bool
    {
        unset($action);
        if (self::isDisplay($user)) {
            return false;
        }
        $module = self::moduleOfResource($resource);
        if ($module !== null && self::isOwnerOnlyModule($module)) {
            return self::isRealOwner($user);
        }
        if (($user['role_slug'] ?? '') === 'owner') {
            return true;
        }
        if ($module === null) {
            return false;
        }

        return $this->hasModule($user, $module);
    }

    /**
     * Owner and employees with see_all_tasks see every task.
     * Everyone else sees a task when they are among its responsible users.
     *
     * @param array<string, mixed> $user
     * @param array<string, mixed> $task
     */
    public function canViewTask(array $user, array $task): bool
    {
        if (!$this->can($user, 'tasks', 'view')) {
            return false;
        }
        if ($this->seesAllTasks($user)) {
            return true;
        }
        $uid = (int) ($user['user_id'] ?? 0);
        if ($uid <= 0) {
            return false;
        }
        if ((int) ($task['assignee_id'] ?? 0) === $uid) {
            return true;
        }
        if (isset($task['assignee_ids']) && is_array($task['assignee_ids'])) {
            return in_array($uid, array_map('intval', $task['assignee_ids']), true);
        }
        $csv = (string) ($task['assignee_ids_csv'] ?? '');
        if ($csv !== '') {
            return in_array((string) $uid, explode(',', $csv), true);
        }

        return false;
    }

    /** @param array<string, mixed> $user */
    public function seesAllTasks(array $user): bool
    {
        if (($user['role_slug'] ?? '') === 'owner') {
            return true;
        }
        if (array_key_exists('see_all_tasks', $user)) {
            return $user['see_all_tasks'] === true || (int) $user['see_all_tasks'] === 1;
        }
        $id = (int) ($user['user_id'] ?? 0);
        if ($id <= 0) {
            return false;
        }
        $stmt = Database::pdo()->prepare('SELECT see_all_tasks FROM users WHERE id = ?');
        $stmt->execute([$id]);

        return (int) $stmt->fetchColumn() === 1;
    }

    /** @param array<string, mixed> $user */
    public function hasModule(array $user, string $module): bool
    {
        if (self::isDisplay($user)) {
            return false;
        }
        if (self::isOwnerOnlyModule($module)) {
            return self::isRealOwner($user);
        }
        if (($user['role_slug'] ?? '') === 'owner') {
            return true;
        }
        if (isset($user['modules']) && is_array($user['modules'])) {
            return in_array($module, $user['modules'], true);
        }

        return in_array($module, $this->modulesForUser($user), true);
    }

    /**
     * @param array<string, mixed> $user
     * @return list<string>
     */
    public function modulesForUser(array $user): array
    {
        if (self::isDisplay($user)) {
            return [];
        }
        if (($user['role_slug'] ?? '') === 'owner') {
            return self::isRealOwner($user)
                ? self::MODULES
                : array_values(array_filter(self::MODULES, static fn (string $m): bool => !self::isOwnerOnlyModule($m)));
        }
        $id = (int) ($user['user_id'] ?? 0);
        if ($id <= 0) {
            return [];
        }
        if (isset(self::$cache[$id])) {
            return self::$cache[$id];
        }
        $stmt = Database::pdo()->prepare('SELECT module FROM user_modules WHERE user_id = ? ORDER BY module');
        $stmt->execute([$id]);
        $list = [];
        while ($module = $stmt->fetch(PDO::FETCH_COLUMN)) {
            if (is_string($module) && in_array($module, self::MODULES, true) && !self::isOwnerOnlyModule($module)) {
                $list[] = $module;
            }
        }
        self::$cache[$id] = $list;

        return $list;
    }

    /**
     * Permissions kept for the existing client: a granted module allows view, update, delete and export.
     *
     * @param array<string, mixed> $user
     * @return list<string>
     */
    public function permissionList(array $user): array
    {
        $list = [];
        foreach ($this->modulesForUser($user) as $module) {
            foreach (['view', 'update', 'delete', 'export'] as $action) {
                $list[] = $module . ':' . $action;
            }
        }

        return $list;
    }

    public static function moduleOfResource(string $resource): ?string
    {
        if ($resource === 'calls') {
            return 'sales';
        }

        return in_array($resource, self::MODULES, true) ? $resource : null;
    }

    /**
     * Module required by an API path. null means any signed-in user.
     * "staff" and "api_tokens" are owner-only and are not grantable modules.
     */
    public static function moduleForPath(string $path): ?string
    {
        $path = rtrim($path, '/') ?: '/';

        return match (true) {
            str_starts_with($path, '/api-tokens') => 'api_tokens',
            str_starts_with($path, '/grok') => 'grok_settings',
            str_starts_with($path, '/staff') => 'staff',
            str_starts_with($path, '/dashboard') => 'dashboard',
            str_starts_with($path, '/tasks'), str_starts_with($path, '/task-'), str_starts_with($path, '/attachments'), $path === '/meta/users' => 'tasks',
            str_starts_with($path, '/deals'), str_starts_with($path, '/quotes'), str_starts_with($path, '/orders'), str_starts_with($path, '/integrations'), str_starts_with($path, '/calls') => 'sales',
            str_starts_with($path, '/warehouse') => 'warehouse',
            str_starts_with($path, '/reports') => 'reports',
            str_starts_with($path, '/team') => 'team_admin',
            $path === '/kp' || str_starts_with($path, '/kp/') => 'kp',
            str_starts_with($path, '/kpi') => 'kpi',
            $path === '/attendance' || str_starts_with($path, '/attendance/') => 'attendance',
            str_starts_with($path, '/analytics') => 'analytics',
            str_starts_with($path, '/agent'), str_starts_with($path, '/mini-chat') => 'agent',
            str_starts_with($path, '/bot') => 'bot',
            str_starts_with($path, '/whatsapp') => 'whatsapp',
            default => null,
        };
    }

    /** @return list<array{key:string,label:string,path:string,resource:?string}> */
    public static function navItems(): array
    {
        return [
            ['key' => 'overview', 'label' => 'Обзор', 'path' => '/dashboard', 'resource' => 'dashboard'],
            ['key' => 'tasks', 'label' => 'Задачи', 'path' => '/tasks', 'resource' => 'tasks'],
            ['key' => 'sales', 'label' => 'Продажи', 'path' => '/sales', 'resource' => 'sales'],
            ['key' => 'team', 'label' => 'Команда', 'path' => '/team', 'resource' => 'team'],
            ['key' => 'kp', 'label' => 'КП', 'path' => '/kp', 'resource' => 'kp'],
            ['key' => 'kpi', 'label' => 'KPI', 'path' => '/kpi', 'resource' => 'kpi'],
            ['key' => 'attendance', 'label' => 'Посещаемость', 'path' => '/attendance', 'resource' => 'attendance'],
            ['key' => 'analytics', 'label' => 'Аналитика', 'path' => '/analytics', 'resource' => 'analytics'],
            ['key' => 'warehouse', 'label' => 'Склад', 'path' => '/warehouse', 'resource' => 'warehouse'],
            ['key' => 'reports', 'label' => 'Отчёты', 'path' => '/reports', 'resource' => 'reports'],
            ['key' => 'agent', 'label' => 'Grok Bot', 'path' => '/agent', 'resource' => 'agent'],
            ['key' => 'whatsapp', 'label' => 'WhatsApp', 'path' => '/whatsapp', 'resource' => 'whatsapp'],
            ['key' => 'settings', 'label' => 'Настройки', 'path' => '/settings', 'resource' => null],
        ];
    }

    /**
     * Server-side scope check for bearer tokens. A "kp" token reaches only /kp and /kp/*.
     * Session users and "full" tokens pass everywhere (old behaviour).
     */
    public static function scopeAllowsPath(string $scope, string $path): bool
    {
        if ($scope === 'full' || $scope === '') {
            return true;
        }
        $path = rtrim($path, '/') ?: '/';
        if ($scope === 'kp') {
            return $path === '/kp' || str_starts_with($path, '/kp/');
        }

        return false;
    }

    /**
     * Delegated timesheet keeper («Табельщик»): an active employee with the attendance module whom the real owner
     * granted the right (attendance_keepers). Never the owner, superadmin or a QR screen.
     */
    public static function isKeeper(array $user): bool
    {
        if (self::isDisplay($user) || ($user['role_slug'] ?? '') !== 'employee') {
            return false;
        }
        $st = \Trx\Database::pdo()->prepare(
            "SELECT 1 FROM attendance_keepers k JOIN users u ON u.id = k.user_id
             JOIN user_modules m ON m.user_id = u.id AND m.module = 'attendance'
             WHERE k.user_id = ? AND u.is_active = 1 AND u.deleted_at IS NULL"
        );
        $st->execute([(int) ($user['user_id'] ?? 0)]);

        return (bool) $st->fetchColumn();
    }

    /** Owner or superadmin (normalizeRole already maps superadmin to owner). */
    public static function isOwner(array $user): bool
    {
        return ($user['role_slug'] ?? '') === 'owner';
    }

    public static function personName(string $name, mixed $deletedAt): string
    {
        if ($deletedAt === null || $deletedAt === '') {
            return $name;
        }

        return $name . ' (удалённый сотрудник)';
    }

    public static function clearCache(): void
    {
        self::$cache = [];
    }
}
