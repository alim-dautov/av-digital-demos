<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Database;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Services\AppException;
use Trx\Services\AuditService;
use Trx\Services\IdempotencyService;
use Trx\Services\TaskService;

/**
 * Stage 0 offline mutation sink. Tasks will plug into the same contract in Stage 1.
 */
final class OutboxController
{
    public function __construct(
        private readonly IdempotencyService $idem = new IdempotencyService(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function store(Request $request, array $user): void
    {
        $idemKey = $request->header('x-idempotency-key');
        if (!$idemKey || strlen($idemKey) < 8) {
            Response::error('Требуется заголовок X-Idempotency-Key', 400);

            return;
        }

        $userId = (int) $user['user_id'];
        $existing = $this->idem->find($userId, $idemKey);
        if ($existing) {
            Response::json($existing['body'], $existing['code']);

            return;
        }

        $action = (string) $request->input('action', '');
        $payload = $request->input('payload', []);
        if ($action === '' || !is_array($payload)) {
            Response::error('Укажите action и payload', 422);

            return;
        }
        $allowed = ['ping', 'draft_comment', 'create_task', 'task_comment'];
        if (!in_array($action, $allowed, true)) {
            Response::error('Это действие нельзя отправить из офлайн-очереди', 422);

            return;
        }
        if ($action === 'create_task') {
            try {
                $task = (new TaskService())->create($user, $payload);
                $body = ['status' => 'applied', 'task_id' => $task['id']];
                $this->idem->store($userId, $idemKey, $request->method, $request->path, hash('sha256', (string) $request->rawBody), 201, $body);
                Response::json($body, 201);
            } catch (AppException $e) {
                Response::error($e->getMessage(), $e->status);
            }

            return;
        }
        if ($action === 'task_comment') {
            try {
                (new TaskService())->comment($user, (int) ($payload['task_id'] ?? 0), (string) ($payload['body'] ?? ''));
                $body = ['status' => 'applied'];
                $this->idem->store($userId, $idemKey, $request->method, $request->path, hash('sha256', (string) $request->rawBody), 201, $body);
                Response::json($body, 201);
            } catch (AppException $e) {
                Response::error($e->getMessage(), $e->status);
            }

            return;
        }

        $stmt = Database::pdo()->prepare(
            'INSERT INTO outbox_entries (user_id, action, payload, status) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $action,
            json_encode($payload, JSON_UNESCAPED_UNICODE),
            'accepted',
        ]);
        $id = (int) Database::pdo()->lastInsertId();

        $body = [
            'id' => $id,
            'status' => 'accepted',
            'action' => $action,
            'queued' => true,
            'message' => 'Принято; ожидает применения',
        ];
        $hash = hash('sha256', (string) $request->rawBody);
        $this->idem->store($userId, $idemKey, $request->method, $request->path, $hash, 201, $body);
        $this->audit->log($userId, 'outbox', (string) $id, 'create', null, $body, $request->ip());

        Response::json($body, 201);
    }
}
