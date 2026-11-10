<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Repositories\TaskRepository;
use Trx\Security\Policy;
use Trx\Services\AppException;
use Trx\Services\TaskService;

final class TasksController
{
    public function __construct(
        private readonly TaskRepository $tasks = new TaskRepository(),
        private readonly Policy $policy = new Policy(),
        private readonly TaskService $service = new TaskService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function dashboard(Request $request, array $user): void
    {
        if (!$this->policy->can($user, 'dashboard', 'view')) {
            Response::error('Недостаточно прав', 403);

            return;
        }
        $period = (string) ($request->query['period'] ?? 'week');
        Response::json($this->tasks->dashboard($user, [
            'department_id' => (int) ($request->query['department_id'] ?? 0) ?: '',
            'period' => in_array($period, ['today', 'week', 'month', 'all'], true) ? $period : 'week',
            'week_offset' => max(-52, min(52, (int) ($request->query['week_offset'] ?? 0))),
        ]));
    }

    /** @param array<string, mixed> $user */
    public function version(Request $request, array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            Response::error('Недостаточно прав', 403);

            return;
        }
        Response::json(['version' => $this->tasks->version($user)], 200, ['Cache-Control' => 'no-store']);
    }

    /** @param array<string, mixed> $user */
    public function unseenCount(Request $request, array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            Response::error('Недостаточно прав', 403);

            return;
        }
        unset($request);
        Response::json(['count' => $this->tasks->unseenCount($user), 'mentions' => $this->tasks->unreadMentionCount($user)], 200, ['Cache-Control' => 'no-store']);
    }

    /** @param array<string, mixed> $user */
    public function index(Request $request, array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            Response::error('Недостаточно прав', 403);

            return;
        }
        $filters = [
            'scope' => $request->query['scope'] ?? '',
            'status' => $request->query['status'] ?? '',
            'assignee_id' => $request->query['assignee_id'] ?? '',
            'priority' => $request->query['priority'] ?? '',
            'q' => trim($request->query['q'] ?? ''),
            'due' => $request->query['due'] ?? '',
            'attention' => $request->query['attention'] ?? '',
            'from' => $this->dateParam($request->query['from'] ?? ''),
            'to' => $this->dateParam($request->query['to'] ?? ''),
        ];
        $items = $this->tasks->list($user, $filters);
        $counts = [
            'mine' => count($this->tasks->list($user, ['scope' => 'mine'])),
            'all' => count($this->tasks->list($user, [])),
            'on_review' => count($this->tasks->list($user, ['scope' => 'on_review'])),
            'overdue' => count($this->tasks->list($user, ['scope' => 'overdue'])),
        ];
        Response::json(['items' => $items, 'counts' => $counts]);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function show(Request $request, array $user, array $params): void
    {
        $task = $this->service->open($user, (int) $params['id']);
        if (!$task) {
            Response::error('Задача не найдена', 404);

            return;
        }
        Response::json($task);
    }

    /** @param array<string, mixed> $user */
    public function create(Request $request, array $user): void
    {
        $this->guard(fn () => $this->service->create($user, $request->body), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function transition(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->transition($user, (int) $params['id'], $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function due(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->changeDue($user, (int) $params['id'], $request->input('due_at')));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function comment(Request $request, array $user, array $params): void
    {
        $files = self::uploadedFiles();
        $this->guard(fn () => $this->service->comment($user, (int) $params['id'], (string) $request->input('body', ''), $files));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function editComment(Request $request, array $user, array $params): void
    {
        $body = $request->input('body');
        $remove = $request->input('remove_attachments', []);
        $remove = is_array($remove) ? array_map('intval', $remove) : array_map('intval', array_filter(explode(',', (string) $remove)));
        $this->guard(fn () => $this->service->editComment($user, (int) $params['id'], $body === null ? null : (string) $body, $remove, self::uploadedFiles()));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function commentDownload(Request $request, array $user, array $params): void
    {
        try {
            $file = $this->service->commentAttachmentFile($user, (int) $params['id']);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);

            return;
        }
        $this->sendFile($file);
    }

    /**
     * Normalises $_FILES['files'] (files[] multi-upload) into a flat list.
     *
     * @return list<array<string, mixed>>
     */
    private static function uploadedFiles(): array
    {
        $raw = $_FILES['files'] ?? null;
        if (!is_array($raw) || !isset($raw['name'])) {
            return [];
        }
        if (!is_array($raw['name'])) {
            return ($raw['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE ? [] : [$raw];
        }
        $out = [];
        foreach (array_keys($raw['name']) as $i) {
            if (($raw['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $out[] = ['name' => $raw['name'][$i], 'type' => $raw['type'][$i] ?? '', 'tmp_name' => $raw['tmp_name'][$i] ?? '', 'error' => $raw['error'][$i], 'size' => $raw['size'][$i] ?? 0];
        }

        return $out;
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function check(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->addCheckItem($user, (int) $params['id'], (string) $request->input('title', '')), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function toggleCheck(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->toggleCheck(
            $user,
            (int) $params['id'],
            (int) $params['item'],
            $request->input('done', false) === true || $request->input('done') === 1 || $request->input('done') === '1'
        ));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function update(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->update($user, (int) $params['id'], $request->body));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function destroy(Request $request, array $user, array $params): void
    {
        $this->guard(function () use ($user, $params): array {
            $this->service->delete($user, (int) $params['id']);

            return ['deleted' => true];
        });
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function removeCheck(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->removeCheckItem($user, (int) $params['id'], (int) $params['item']));
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function upload(Request $request, array $user, array $params): void
    {
        $file = isset($_FILES['file']) && is_array($_FILES['file']) ? $_FILES['file'] : null;
        $this->guard(fn () => $this->service->addAttachment($user, (int) $params['id'], $file), 201);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function download(Request $request, array $user, array $params): void
    {
        try {
            $file = $this->service->attachmentFile($user, (int) $params['id']);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);

            return;
        }
        $this->sendFile($file);
    }

    /** @param array{path:string,name:string,mime:string,size:int} $file */
    private function sendFile(array $file): void
    {
        $inline = str_starts_with($file['mime'], 'image/') || $file['mime'] === 'application/pdf';
        $ascii = preg_replace('/[^\x20-\x7E]/', '_', $file['name']) ?: 'file';
        header('Content-Type: ' . $file['mime']);
        header('Content-Length: ' . $file['size']);
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'");
        header(sprintf(
            "Content-Disposition: %s; filename=\"%s\"; filename*=UTF-8''%s",
            $inline ? 'inline' : 'attachment',
            str_replace('"', '', $ascii),
            rawurlencode($file['name'])
        ));
        readfile($file['path']);
    }

    /** @param array<string, mixed> $user @param array<string, string> $params */
    public function deleteAttachment(Request $request, array $user, array $params): void
    {
        $this->guard(fn () => $this->service->deleteAttachment($user, (int) $params['id']));
    }

    /** @param array<string, mixed> $user */
    public function users(Request $request, array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'view')) {
            Response::error('Недостаточно прав', 403);

            return;
        }
        Response::json(['items' => $this->service->users($user)]);
    }

    private function dateParam(string $value): string
    {
        return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : '';
    }

    private function guard(callable $fn, int $status = 200): void
    {
        try {
            Response::json($fn(), $status);
        } catch (AppException $e) {
            Response::error($e->getMessage(), $e->status);
        }
    }
}
