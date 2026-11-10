<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Auth\AuthService;
use Trx\Config;
use Trx\Database;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Security\Policy;
use Trx\Services\PushService;

final class MeController
{
    public function __construct(
        private readonly AuthService $auth = new AuthService(),
        private readonly Policy $policy = new Policy(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function me(Request $request, array $user): void
    {
        $demo = (bool) Config::get('app.demo_mode', false);
        $stmt = Database::pdo()->query("SELECT `value` FROM settings WHERE `key` = 'demo_mode' LIMIT 1");
        $row = $stmt ? $stmt->fetch(\PDO::FETCH_ASSOC) : false;
        if ($row) {
            $decoded = json_decode((string) $row['value'], true);
            $demo = (bool) $decoded;
        }

        $public = $this->auth->publicUser($user);
        $modules = $this->policy->modulesForUser($user);
        Response::json([
            'user' => $public,
            'modules' => $modules,
            'permissions' => $this->policy->permissionList($user),
            'demo_mode' => $demo,
            'csrf_token' => $user['csrf_token'],
            'timezone' => Config::get('app.timezone', 'Asia/Almaty'),
            'server_time' => (new \DateTimeImmutable('now', new \DateTimeZone('Asia/Almaty')))->format(DATE_ATOM),
            'vapid_public_key' => (new PushService())->publicKey(),
        ]);
    }

    /** @param array<string, mixed> $user */
    public function changePassword(Request $request, array $user): void
    {
        $current = $request->input('current_password');
        $new = $request->input('new_password');
        if (!is_string($current) || $current === '' || !is_string($new) || $new === '') {
            Response::error('Укажите текущий и новый пароль', 422);

            return;
        }

        $result = $this->auth->changePassword((int) $user['user_id'], (string) $user['id'], $current, $new, $request->ip());
        if (!$result['ok']) {
            Response::error($result['error'] ?? 'Не удалось сменить пароль', 422);

            return;
        }
        Response::json(['ok' => true]);
    }
}
