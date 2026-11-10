<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;

final class NotificationService
{
    public function __construct(
        private readonly JobQueue $jobs = new JobQueue(),
        private readonly PushService $push = new PushService(),
    ) {
    }

    /**
     * Stores an in-app notification and queues Web Push.
     * With a dedupe key the same notification is delivered to a user only once.
     */
    public function notify(int $userId, string $kind, string $title, string $body, string $url, ?string $dedupeKey = null): bool
    {
        if ($userId <= 0) {
            return false;
        }
        $pdo = Database::pdo();
        if ($dedupeKey !== null) {
            try {
                $pdo->prepare('INSERT INTO notification_log (user_id, dedupe_key) VALUES (?,?)')->execute([$userId, mb_substr($dedupeKey, 0, 190)]);
            } catch (\PDOException) {
                return false;
            }
        }
        $pdo->prepare('INSERT INTO notifications (user_id, kind, title, body, url) VALUES (?,?,?,?,?)')->execute([
            $userId,
            $kind,
            mb_substr($title, 0, 255),
            mb_substr($body, 0, 500),
            mb_substr($url, 0, 255),
        ]);
        if ($this->push->isConfigured() && $this->hasSubscription($userId)) {
            $job = ['user_id' => $userId, 'title' => $title, 'body' => $body, 'url' => $url];
            if ($kind === 'task_urgent') {
                $job['requireInteraction'] = true;
                $job['tag'] = 'urgent-' . $userId . '-' . md5($url);
            }
            $this->jobs->enqueue('web_push', $job);
        }

        return true;
    }

    private function hasSubscription(int $userId): bool
    {
        $stmt = Database::pdo()->prepare('SELECT 1 FROM push_subscriptions WHERE user_id = ? LIMIT 1');
        $stmt->execute([$userId]);

        return (bool) $stmt->fetchColumn();
    }

    /**
     * @param list<int> $userIds
     */
    public function notifyMany(array $userIds, int $exceptUserId, string $kind, string $title, string $body, string $url, ?string $dedupePrefix = null): void
    {
        foreach (array_unique($userIds) as $userId) {
            if ($userId === $exceptUserId) {
                continue;
            }
            $this->notify($userId, $kind, $title, $body, $url, $dedupePrefix !== null ? $dedupePrefix . '-' . $userId : null);
        }
    }

    /** @return array{items: list<array<string, mixed>>, unread: int} */
    public function list(int $userId, int $limit = 30): array
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare(
            "SELECT id, kind, title, body, url, read_at, created_at FROM notifications
             WHERE user_id = ? ORDER BY id DESC LIMIT {$limit}"
        );
        $stmt->execute([$userId]);
        $unread = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL');
        $unread->execute([$userId]);

        return [
            'items' => $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [],
            'unread' => (int) $unread->fetchColumn(),
        ];
    }

    /** @param list<int> $ids empty list marks everything as read */
    public function markRead(int $userId, array $ids): void
    {
        $pdo = Database::pdo();
        if ($ids === []) {
            $pdo->prepare('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL')->execute([$userId]);

            return;
        }
        $ids = array_values(array_map('intval', $ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND id IN ({$placeholders})")
            ->execute(array_merge([$userId], $ids));
    }
}
