<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Security\Policy;

final class MiniChatService
{
    public function __construct(
        private readonly WebhookDispatcher $webhooks = new WebhookDispatcher(),
        private readonly GrokSettingsService $grok = new GrokSettingsService(),
        private readonly Policy $policy = new Policy(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @return list<array<string, mixed>>
     */
    public function list(array $user, int $afterId, int $limit = 100): array
    {
        $limit = max(1, min(100, $limit));
        $stmt = Database::pdo()->prepare(
            'SELECT id, command_id, role, body, delivery_status, delivery_error, created_at
             FROM mini_chat_messages
             WHERE user_id = ? AND id > ?
             ORDER BY id
             LIMIT ' . $limit
        );
        $stmt->execute([(int) $user['user_id'], max(0, $afterId)]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return array_map(fn (array $row): array => $this->present($row), $rows);
    }

    /**
     * Saves the user's command. Webhook delivery is a separate step so the UI can return immediately.
     *
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    public function accept(array $user, string $text): array
    {
        $text = trim($text);
        if ($text === '') {
            throw new AppException('Напишите сообщение', 422);
        }
        if (mb_strlen($text) > 4000) {
            throw new AppException('Сообщение длиннее 4000 символов', 422);
        }
        $config = $this->grok->dispatchConfig();
        $status = $config['url'] === '' ? 'skipped' : 'pending';
        $commandId = $this->uuid();
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO mini_chat_messages (user_id, command_id, role, body, delivery_status)
             VALUES (?, ?, \'user\', ?, ?)'
        )->execute([(int) $user['user_id'], $commandId, $text, $status]);
        $id = (int) $pdo->lastInsertId();

        return $this->present($this->fetch($id));
    }

    public function dispatch(int $id): void
    {
        $row = $this->fetch($id);
        if ((string) $row['delivery_status'] !== 'pending' || (string) $row['role'] !== 'user') {
            return;
        }
        try {
            $config = $this->grok->dispatchConfig();
        } catch (AppException $e) {
            $this->mark($id, 'failed', $e->getMessage());

            return;
        }
        if ($config['url'] === '') {
            $this->mark($id, 'skipped', null);

            return;
        }
        $user = $this->userName((int) $row['user_id']);
        try {
            $result = $this->webhooks->send($config['url'], $config['key'], $config['auth'], [
                'text' => (string) $row['body'],
                'userId' => (int) $row['user_id'],
                'userName' => $user,
                'commandId' => (string) $row['command_id'],
            ]);
        } catch (AppException $e) {
            $this->mark($id, 'failed', $e->getMessage());

            return;
        }
        if ($result['ok']) {
            $this->mark($id, 'sent', null);

            return;
        }
        $this->mark($id, 'failed', $result['error'] !== '' ? $result['error'] : 'Вебхук не ответил');
    }

    /**
     * Bot reply into a user's mini-chat. The command must already exist for that user.
     *
     * @param array<string, mixed> $actor
     * @return array<string, mixed>
     */
    public function reply(array $actor, int $userId, string $commandId, string $text): array
    {
        if (!$this->policy->can($actor, 'agent', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
        $text = trim($text);
        $commandId = trim($commandId);
        if ($userId <= 0 || $commandId === '' || $text === '') {
            throw new AppException('Нужны userId, commandId и text', 422);
        }
        if (mb_strlen($text) > 8000 || strlen($commandId) > 36) {
            throw new AppException('Слишком длинный ответ или commandId', 422);
        }
        $pdo = Database::pdo();
        $user = $pdo->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1 LIMIT 1');
        $user->execute([$userId]);
        if (!(int) $user->fetchColumn()) {
            throw new AppException('Сотрудник не найден', 404);
        }
        $command = $pdo->prepare(
            "SELECT id FROM mini_chat_messages WHERE user_id = ? AND command_id = ? AND role = 'user' LIMIT 1"
        );
        $command->execute([$userId, $commandId]);
        if (!(int) $command->fetchColumn()) {
            throw new AppException('Команда с таким commandId не найдена', 404);
        }
        $pdo->prepare(
            'INSERT INTO mini_chat_messages (user_id, command_id, role, body, delivery_status)
             VALUES (?, ?, \'assistant\', ?, \'local\')'
        )->execute([$userId, $commandId, $text]);

        return $this->present($this->fetch((int) $pdo->lastInsertId()));
    }

    /** @return array<string, mixed> */
    private function fetch(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT id, user_id, command_id, role, body, delivery_status, delivery_error, created_at
             FROM mini_chat_messages WHERE id = ? LIMIT 1'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Сообщение не найдено', 404);
        }

        return $row;
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function present(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'command_id' => (string) $row['command_id'],
            'role' => (string) $row['role'],
            'text' => (string) $row['body'],
            'delivery_status' => (string) $row['delivery_status'],
            'delivery_error' => $row['delivery_error'] !== null ? (string) $row['delivery_error'] : null,
            'created_at' => (string) $row['created_at'],
        ];
    }

    private function mark(int $id, string $status, ?string $error): void
    {
        Database::pdo()->prepare(
            'UPDATE mini_chat_messages SET delivery_status = ?, delivery_error = ? WHERE id = ? AND delivery_status = \'pending\''
        )->execute([$status, $error !== null ? mb_substr($error, 0, 255) : null, $id]);
    }

    private function userName(int $userId): string
    {
        $stmt = Database::pdo()->prepare('SELECT name FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $name = $stmt->fetchColumn();

        return is_string($name) ? $name : '';
    }

    private function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);

        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }
}
