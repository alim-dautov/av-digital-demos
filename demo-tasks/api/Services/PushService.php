<?php

declare(strict_types=1);

namespace Trx\Services;

use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\VAPID;
use Minishlink\WebPush\WebPush;
use Trx\Config;
use Trx\Database;

final class PushService
{
    private const TIMEOUT_SECONDS = 10;
    private const SETTINGS_KEY = 'vapid_keys';
    private const DEFAULT_SUBJECT = 'mailto:admin@demo.local';

    /** @var array{publicKey: string, privateKey: string}|null */
    private static ?array $keys = null;

    public function isConfigured(): bool
    {
        return $this->keys() !== null;
    }

    public function publicKey(): string
    {
        return $this->keys()['publicKey'] ?? '';
    }

    /** @return array{sent: int, failed: int, errors: list<string>} */
    /** @param array{requireInteraction?: bool, tag?: string} $extra */
    public function sendToUser(int $userId, string $title, string $body, string $url = '/', array $extra = []): array
    {
        $keys = $this->keys();
        if ($keys === null) {
            throw new \RuntimeException('VAPID keys are not configured');
        }

        $auth = [
            'VAPID' => [
                'subject' => (string) (Config::get('vapid.subject') ?: self::DEFAULT_SUBJECT),
                'publicKey' => $keys['publicKey'],
                'privateKey' => $keys['privateKey'],
            ],
        ];
        $webPush = new WebPush($auth, [], self::TIMEOUT_SECONDS);
        $stmt = Database::pdo()->prepare(
            'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
        );
        $stmt->execute([$userId]);
        $payloadData = [
            'title' => $title,
            'body' => $body,
            'url' => $url,
        ];
        try {
            // The service worker sets the app icon badge from this, even when the app is closed.
            $payloadData['badgeCount'] = (new \Trx\Repositories\TaskRepository())->unreadMentionCount(['user_id' => $userId]);
        } catch (\Throwable) {
        }
        if (!empty($extra['requireInteraction'])) {
            $payloadData['requireInteraction'] = true;
        }
        if (!empty($extra['tag'])) {
            $payloadData['tag'] = (string) $extra['tag'];
        }
        $payload = json_encode($payloadData, JSON_UNESCAPED_UNICODE);

        $result = ['sent' => 0, 'failed' => 0, 'errors' => []];
        while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
            $subscription = Subscription::create([
                'endpoint' => $row['endpoint'],
                'contentEncoding' => 'aes128gcm',
                'keys' => [
                    'p256dh' => $row['p256dh'],
                    'auth' => $row['auth'],
                ],
            ]);
            $report = $webPush->sendOneNotification($subscription, $payload ?: '{}');
            if ($report->isSuccess()) {
                $result['sent']++;
                continue;
            }
            $result['failed']++;
            $result['errors'][] = $report->getReason();
            if ($report->isSubscriptionExpired()) {
                Database::pdo()->prepare('DELETE FROM push_subscriptions WHERE id = ?')->execute([(int) $row['id']]);
            }
        }

        return $result;
    }

    /**
     * Keys from config.php win; otherwise a pair is generated once and kept in settings, so every
     * deploy reuses it. Regenerating would silently break all existing browser subscriptions.
     *
     * @return array{publicKey: string, privateKey: string}|null
     */
    private function keys(): ?array
    {
        if (self::$keys !== null) {
            return self::$keys;
        }
        $public = (string) Config::get('vapid.public_key', '');
        $private = (string) Config::get('vapid.private_key', '');
        if ($public !== '' && $private !== '') {
            return self::$keys = ['publicKey' => $public, 'privateKey' => $private];
        }

        $stored = $this->storedKeys();
        if ($stored === null) {
            try {
                $fresh = VAPID::createVapidKeys();
            } catch (\Throwable $e) {
                error_log('DEMO push: cannot generate VAPID keys: ' . $e->getMessage());

                return null;
            }
            Database::pdo()->prepare('INSERT IGNORE INTO settings (`key`, `value`) VALUES (?, ?)')->execute([
                self::SETTINGS_KEY,
                json_encode(['publicKey' => $fresh['publicKey'], 'privateKey' => $fresh['privateKey']]),
            ]);
            $stored = $this->storedKeys();
        }

        return self::$keys = $stored;
    }

    /** @return array{publicKey: string, privateKey: string}|null */
    private function storedKeys(): ?array
    {
        $value = (new SettingsService())->get(self::SETTINGS_KEY);
        if (!is_array($value) || empty($value['publicKey']) || empty($value['privateKey'])) {
            return null;
        }

        return ['publicKey' => (string) $value['publicKey'], 'privateKey' => (string) $value['privateKey']];
    }
}
