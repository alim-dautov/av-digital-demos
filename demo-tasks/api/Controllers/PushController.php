<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Database;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\PushService;

final class PushController
{
    public function __construct(private readonly PushService $push = new PushService())
    {
    }

    /** @param array<string, mixed> $user */
    public function subscribe(Request $request, array $user): void
    {
        $endpoint = (string) $request->input('endpoint', '');
        $keys = $request->input('keys', []);
        if ($endpoint === '' || !is_array($keys) || empty($keys['p256dh']) || empty($keys['auth'])) {
            Response::error('Некорректная подписка push', 422);

            return;
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), user_id = VALUES(user_id)'
        );
        $stmt->execute([
            (int) $user['user_id'],
            $endpoint,
            (string) $keys['p256dh'],
            (string) $keys['auth'],
            $request->userAgent(),
        ]);

        Response::json(['ok' => true]);
    }

    /** @param array<string, mixed> $user */
    public function unsubscribe(Request $request, array $user): void
    {
        $endpoint = (string) $request->input('endpoint', '');
        if ($endpoint === '') {
            Response::error('Укажите endpoint', 422);

            return;
        }
        Database::pdo()->prepare(
            'DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?'
        )->execute([(int) $user['user_id'], $endpoint]);

        Response::json(['ok' => true]);
    }

    /** @param array<string, mixed> $user */
    public function test(Request $request, array $user): void
    {
        if (!$this->push->isConfigured()) {
            Response::error('Push не настроен на сервере: нет VAPID-ключей', 503);

            return;
        }
        $result = $this->push->sendToUser((int) $user['user_id'], 'Demo CRM', 'Тестовое уведомление: всё работает', '/settings');
        if ($result['sent'] === 0) {
            Response::error($result['failed'] > 0 ? 'Не удалось доставить: ' . implode('; ', $result['errors']) : 'Этот браузер не подписан на уведомления', 422);

            return;
        }
        Response::json(['ok' => true, 'sent' => $result['sent'], 'failed' => $result['failed']]);
    }
}
