<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Config;
use Trx\Database;
use Trx\Domain\TaskProof;
use Trx\Domain\TaskWorkflow;
use Trx\Repositories\TaskRepository;
use Trx\Security\Policy;

final class TaskService
{
    private const PRIORITIES = ['low', 'medium', 'high'];

    /** @var array<string, string> mime => extension */
    public const MAX_COMMENT_FILES = 10;

    private const ALLOWED_MIME = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
        'application/pdf' => 'pdf',
        'text/plain' => 'txt',
        'text/csv' => 'csv',
        'application/zip' => 'zip',
        'application/msword' => 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
        'application/vnd.ms-excel' => 'xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    ];

    public function __construct(
        private readonly TaskRepository $tasks = new TaskRepository(),
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
        private readonly NotificationService $notifications = new NotificationService(),
        private readonly SettingsService $settings = new SettingsService(),
    ) {
    }

    /**
     * Opening the task card. Marks the task seen for this user and returns the detail.
     *
     * @param array<string, mixed> $user
     */
    public function open(array $user, int $id): ?array
    {
        $task = $this->show($user, $id);
        if (!$task) {
            return null;
        }
        $this->tasks->markSeen((int) $user['user_id'], $id);
        $this->tasks->markMentionsRead((int) $user['user_id'], $id);
        $task['unseen'] = false;
        $task['unread_mentions'] = 0;

        return $task;
    }

    /** @param array<string, mixed> $user */
    public function show(array $user, int $id): ?array
    {
        $task = $this->tasks->find($user, $id);
        if (!$task) {
            return null;
        }
        $pdo = Database::pdo();
        $comments = $pdo->prepare(
            'SELECT c.id, c.body, c.created_at, c.edited_at, c.user_id, u.name, u.initials, u.deleted_at
             FROM task_comments c JOIN users u ON u.id = c.user_id
             WHERE c.task_id = ? ORDER BY c.id'
        );
        $comments->execute([$id]);
        $history = $pdo->prepare(
            'SELECT h.id, h.field_name, h.old_value, h.new_value, h.created_at, u.name AS user_name, u.deleted_at
             FROM task_history h LEFT JOIN users u ON u.id = h.user_id
             WHERE h.task_id = ? ORDER BY h.id'
        );
        $history->execute([$id]);
        $check = $pdo->prepare('SELECT id, title, is_done FROM task_checklist WHERE task_id = ? ORDER BY sort_order, id');
        $check->execute([$id]);
        $attachments = $pdo->prepare(
            'SELECT a.id, a.original_name, a.mime, a.size, a.created_at, a.user_id, u.name AS user_name, u.deleted_at
             FROM task_attachments a JOIN users u ON u.id = a.user_id WHERE a.task_id = ? ORDER BY a.id'
        );
        $attachments->execute([$id]);

        $commentFiles = [];
        $files = $pdo->prepare('SELECT id, comment_id, original_name, mime, size, created_at FROM task_comment_attachments WHERE task_id = ? ORDER BY id');
        $files->execute([$id]);
        foreach ($files->fetchAll(PDO::FETCH_ASSOC) ?: [] as $file) {
            $commentFiles[(int) $file['comment_id']][] = [
                'id' => (int) $file['id'],
                'name' => $file['original_name'],
                'mime' => $file['mime'],
                'size' => (int) $file['size'],
                'created_at' => $file['created_at'],
                'url' => '/api/comment-attachments/' . $file['id'],
            ];
        }
        $viewer = (int) ($user['user_id'] ?? 0);
        $task['comments'] = array_map(static function (array $row) use ($commentFiles, $viewer): array {
            $row['name'] = Policy::personName((string) $row['name'], $row['deleted_at'] ?? null);
            unset($row['deleted_at']);
            $row['attachments'] = $commentFiles[(int) $row['id']] ?? [];
            $row['can_edit'] = $viewer > 0 && (int) $row['user_id'] === $viewer;

            return $row;
        }, $comments->fetchAll(PDO::FETCH_ASSOC) ?: []);
        $task['history'] = array_map(static function (array $row): array {
            if ($row['user_name'] !== null) {
                $row['user_name'] = Policy::personName((string) $row['user_name'], $row['deleted_at'] ?? null);
            }
            unset($row['deleted_at']);

            return $row;
        }, $history->fetchAll(PDO::FETCH_ASSOC) ?: []);
        $task['checklist'] = array_map(
            static fn (array $row): array => ['id' => (int) $row['id'], 'title' => $row['title'], 'is_done' => (bool) $row['is_done']],
            $check->fetchAll(PDO::FETCH_ASSOC) ?: []
        );
        $task['attachments'] = array_map(
            static fn (array $row): array => [
                'id' => (int) $row['id'],
                'name' => $row['original_name'],
                'mime' => $row['mime'],
                'size' => (int) $row['size'],
                'created_at' => $row['created_at'],
                'user_id' => (int) $row['user_id'],
                'user_name' => Policy::personName((string) $row['user_name'], $row['deleted_at'] ?? null),
                'url' => '/api/attachments/' . $row['id'],
            ],
            $attachments->fetchAll(PDO::FETCH_ASSOC) ?: []
        );
        $task['deal'] = null;
        if (!empty($task['deal_id']) && $this->policy->can($user, 'sales', 'view')) {
            $deal = $pdo->prepare('SELECT id, number, title FROM deals WHERE id = ?');
            $deal->execute([(int) $task['deal_id']]);
            $task['deal'] = $deal->fetch(PDO::FETCH_ASSOC) ?: null;
        }
        $task['can'] = $this->abilities($user, $task);
        $task['proof'] = [
            'requires_file' => (bool) ($task['requires_file'] ?? false),
            'requires_photo' => (bool) ($task['requires_photo'] ?? false),
            'requires_checklist' => (bool) ($task['requires_checklist'] ?? false),
            'missing' => $this->missingProof($id, $task),
        ];


        return $task;
    }

    /**
     * @param array<string, mixed> $task row with requires_* flags
     * @return list<string>
     */
    public function missingProof(int $id, array $task): array
    {
        if (empty($task['requires_file']) && empty($task['requires_photo']) && empty($task['requires_checklist'])) {
            return [];
        }
        $pdo = Database::pdo();
        $m = $pdo->prepare('SELECT mime FROM task_attachments WHERE task_id = ? UNION ALL SELECT mime FROM task_comment_attachments WHERE task_id = ?');
        $m->execute([$id, $id]);
        $c = $pdo->prepare('SELECT COUNT(*) AS total, COALESCE(SUM(is_done), 0) AS done FROM task_checklist WHERE task_id = ?');
        $c->execute([$id]);
        $counts = $c->fetch(PDO::FETCH_ASSOC) ?: ['total' => 0, 'done' => 0];

        return TaskProof::missing($task, array_map('strval', $m->fetchAll(PDO::FETCH_COLUMN) ?: []), ['total' => (int) $counts['total'], 'done' => (int) $counts['done']]);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function create(array $user, array $input): array
    {
        $this->requireUpdate($user);
        $template = null;
        if (!empty($input['template_id'])) {
            $template = $this->template((int) $input['template_id']);
        }

        $title = trim((string) ($input['title'] ?? ($template['title'] ?? '')));
        if ($title === '') {
            throw new AppException('Укажите название задачи');
        }
        $assigneeIds = $this->assigneeIdsFromInput($input, (int) $user['user_id']);
        $this->assertAssigneeSet($assigneeIds);
        $assignee = $assigneeIds[0];
        $dept = (int) ($input['department_id'] ?? 0);
        if ($dept > 0) {
            $this->assertDepartment($dept);
        } else {
            $dept = null;
        }
        $priority = (string) ($input['priority'] ?? $template['priority'] ?? 'medium');
        if (!in_array($priority, self::PRIORITIES, true)) {
            throw new AppException('Неизвестный приоритет');
        }
        $startsAt = $this->dateTimeOrNull($input['starts_at'] ?? null);
        $dueAt = $this->dateTimeOrNull($input['due_at'] ?? null);
        $urgent = $this->urgentFlag($input['is_urgent'] ?? 0);
        if ($dueAt === null && $template !== null) {
            $dueAt = date('Y-m-d H:i:s', time() + (int) $template['due_in_hours'] * 3600);
        }
        $this->assertDateOrder($startsAt, $dueAt);

        $pdo = Database::pdo();
        $number = 'DEMO-' . date('ymd') . '-' . random_int(100000, 999999);
        $pdo->prepare(
            'INSERT INTO tasks (number, title, description, creator_id, assignee_id, department_id, priority, status,
                                starts_at, due_at, client_id, deal_id, template_id, recurrence_id, recur_on, is_urgent,
                                requires_file, requires_photo, requires_checklist, kpi_key)
             VALUES (?,?,?,?,?,?,?,\'new\',?,?,?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $number,
            mb_substr($title, 0, 255),
            trim((string) ($input['description'] ?? ($template['description'] ?? ''))) ?: null,
            (int) $user['user_id'],
            $assignee,
            $dept,
            $priority,
            $startsAt,
            $dueAt,
            !empty($input['client_id']) ? (int) $input['client_id'] : null,
            !empty($input['deal_id']) ? (int) $input['deal_id'] : null,
            $template['id'] ?? null,
            !empty($input['recurrence_id']) ? (int) $input['recurrence_id'] : null,
            $input['recur_on'] ?? null,
            $urgent,
            (int) ($template['requires_file'] ?? 0),
            (int) ($template['requires_photo'] ?? 0),
            (int) ($template['requires_checklist'] ?? 0),
            $template['kpi_key'] ?? null,
        ]);
        $id = (int) $pdo->lastInsertId();
        $this->replaceAssigneeRows($id, $assigneeIds);

        $checklist = $input['checklist'] ?? ($template !== null ? (json_decode((string) ($template['checklist'] ?? '[]'), true) ?: []) : []);
        $order = 0;
        foreach ((array) $checklist as $item) {
            $itemTitle = trim((string) $item);
            if ($itemTitle !== '') {
                $pdo->prepare('INSERT INTO task_checklist (task_id, title, sort_order) VALUES (?,?,?)')->execute([$id, mb_substr($itemTitle, 0, 255), $order++]);
            }
        }
        $this->audit->log((int) $user['user_id'], 'task', (string) $id, 'create', null, ['title' => $title, 'assignee_ids' => $assigneeIds]);
        foreach ($assigneeIds as $assigneeId) {
            if ($assigneeId !== (int) $user['user_id']) {
                $this->notifications->notify($assigneeId, 'task_assigned', 'Новая задача', $title, $this->url($id), 'task-assign-' . $id . '-' . $assigneeId);
            }
        }
        if ($urgent === 1) {
            $this->notifyUrgent($id, mb_substr($title, 0, 255), $assigneeIds);
        }
        $found = $this->show($user, $id);
        if ($found) {
            return $found;
        }
        $created = $this->tasks->present($id);
        if (!$created) {
            throw new AppException('Задача создана, но недоступна для просмотра', 403);
        }

        return $created;
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function update(array $user, int $id, array $input): array
    {
        $this->requireUpdate($user);
        $current = $this->visibleRow($user, $id);
        if (in_array($current['status'], ['done', 'cancelled'], true) && $user['role_slug'] !== 'owner') {
            throw new AppException('Закрытую задачу нельзя изменить');
        }

        $changes = [];
        $assigneesChanged = false;
        if (array_key_exists('title', $input)) {
            $title = trim((string) $input['title']);
            if ($title === '') {
                throw new AppException('Укажите название задачи');
            }
            $changes['title'] = mb_substr($title, 0, 255);
        }
        if (array_key_exists('description', $input)) {
            $changes['description'] = trim((string) $input['description']) ?: null;
        }
        $assigneeRequest = array_key_exists('assignee_ids', $input) || array_key_exists('assignee_id', $input);
        if (array_key_exists('priority', $input)) {
            $priority = (string) $input['priority'];
            if (!in_array($priority, self::PRIORITIES, true)) {
                throw new AppException('Неизвестный приоритет');
            }
            $changes['priority'] = $priority;
        }
        if (array_key_exists('starts_at', $input)) {
            $changes['starts_at'] = $this->dateTimeOrNull($input['starts_at']);
        }
        if (array_key_exists('due_at', $input)) {
            $changes['due_at'] = $this->dateTimeOrNull($input['due_at']);
        }
        if (array_key_exists('deal_id', $input)) {
            $changes['deal_id'] = !empty($input['deal_id']) ? (int) $input['deal_id'] : null;
        }
        if (array_key_exists('client_id', $input)) {
            $changes['client_id'] = !empty($input['client_id']) ? (int) $input['client_id'] : null;
        }
        if (array_key_exists('is_urgent', $input)) {
            $changes['is_urgent'] = $this->urgentFlag($input['is_urgent']);
        }
        $this->assertDateOrder(
            array_key_exists('starts_at', $changes) ? $changes['starts_at'] : $current['starts_at'],
            array_key_exists('due_at', $changes) ? $changes['due_at'] : $current['due_at']
        );
        $changes = array_filter(
            $changes,
            static fn ($value, $field) => (string) ($current[$field] ?? '') !== (string) ($value ?? ''),
            ARRAY_FILTER_USE_BOTH
        );
        if ($assigneeRequest) {
            $assigneesChanged = $this->changeAssignees($user, $id, $current, $input);
        }
        if ($changes === [] && !$assigneesChanged) {
            return $this->show($user, $id) ?? [];
        }

        $actor = (int) $user['user_id'];
        if ($changes !== []) {
            $sets = implode(', ', array_map(static fn ($field) => "{$field} = ?", array_keys($changes)));
            Database::pdo()->prepare("UPDATE tasks SET {$sets} WHERE id = ?")->execute([...array_values($changes), $id]);
            foreach (['title', 'department_id', 'priority', 'starts_at', 'due_at', 'is_urgent'] as $field) {
                if (array_key_exists($field, $changes)) {
                    $this->history($id, $actor, $field, $this->historyValue($field, $current[$field]), $this->historyValue($field, $changes[$field]));
                }
            }
            $this->audit->log($actor, 'task', (string) $id, 'update', array_intersect_key($current, $changes), $changes);
        }

        $title = (string) ($changes['title'] ?? $current['title']);
        if (array_key_exists('due_at', $changes)) {
            $this->notifyParticipants($id, $current, $actor, 'task_due_changed', 'Изменён срок задачи', $title);
        }
        if (array_key_exists('is_urgent', $changes) && (int) $changes['is_urgent'] === 1) {
            $this->notifyUrgent($id, $title, $this->storedAssigneeIds($id, (int) $current['assignee_id']));
        }

        return $this->show($user, $id) ?? [];
    }

    /** @param array<string, mixed> $user */
    public function delete(array $user, int $id): void
    {
        if (!$this->policy->can($user, 'tasks', 'delete')) {
            throw new AppException('Недостаточно прав', 403);
        }
        $current = $this->visibleRow($user, $id);
        foreach ($this->attachmentRows($id) as $attachment) {
            $this->removeFile((string) $attachment['stored_path']);
        }
        $commentFiles = Database::pdo()->prepare('SELECT stored_path FROM task_comment_attachments WHERE task_id = ?');
        $commentFiles->execute([$id]);
        foreach ($commentFiles->fetchAll(PDO::FETCH_COLUMN) ?: [] as $stored) {
            $this->removeFile((string) $stored);
        }
        Database::pdo()->prepare('DELETE FROM task_comment_attachments WHERE task_id = ?')->execute([$id]);
        Database::pdo()->prepare('DELETE FROM tasks WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'task', (string) $id, 'delete', ['title' => $current['title'], 'status' => $current['status']], null);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function transition(array $user, int $id, array $input): array
    {
        $this->requireUpdate($user);
        $current = $this->visibleRow($user, $id);
        $to = (string) ($input['status'] ?? '');
        $check = TaskWorkflow::canTransit(
            ['id' => (int) $user['user_id'], 'role' => (string) $user['role_slug']],
            ['status' => (string) $current['status'], 'creator_id' => (int) $current['creator_id']],
            $to,
            $input
        );
        if (!$check['ok']) {
            throw new AppException((string) $check['error']);
        }
        if (in_array($to, ['on_review', 'done'], true)) {
            $missing = $this->missingProof($id, $current);
            if ($missing !== []) {
                (new KpiAlerts())->proofMissing($id, $current, (int) $user['user_id'], $missing);
                throw new AppException(TaskProof::message($missing));
            }
        }
        $pdo = Database::pdo();
        $pdo->prepare(
            'UPDATE tasks SET status = ?, cancel_reason = ?, completed_at = IF(? = \'done\', NOW(), completed_at),
             submitted_at = IF(? = \'on_review\', NOW(), submitted_at) WHERE id = ?'
        )->execute([
            $to,
            $to === 'cancelled' ? trim((string) $input['cancel_reason']) : $current['cancel_reason'],
            $to,
            $to,
            $id,
        ]);
        $actor = (int) $user['user_id'];
        $this->history($id, $actor, 'status', (string) $current['status'], $to);
        if (trim((string) ($input['comment'] ?? '')) !== '') {
            $this->comment($user, $id, (string) $input['comment']);
        }
        $this->audit->log($actor, 'task', (string) $id, 'status', ['status' => $current['status']], ['status' => $to]);
        $this->notifyTransition($id, $current, $to, $actor, $input);

        $shown = $this->show($user, $id);
        if (!$shown) {
            throw new AppException('Задача не найдена', 404);
        }

        return $shown;
    }

    /** @param array<string, mixed> $user */
    public function changeDue(array $user, int $id, ?string $dueAt): array
    {
        return $this->update($user, $id, ['due_at' => $dueAt]);
    }

    /** @param array<string, mixed> $user */
    /** @param array<string, mixed> $user @param list<array<string, mixed>> $files */
    public function comment(array $user, int $id, string $body, array $files = []): array
    {
        $current = $this->visibleRow($user, $id);
        $body = trim($body);
        $prepared = $this->checkCommentFiles($files, 0);
        if ($body === '' && $prepared === []) {
            throw new AppException('Пустой комментарий');
        }
        $pdo = Database::pdo();
        $pdo->prepare('INSERT INTO task_comments (task_id, user_id, body) VALUES (?,?,?)')->execute([$id, (int) $user['user_id'], $body]);
        $commentId = (int) $pdo->lastInsertId();
        $this->storeCommentFiles($id, $commentId, (int) $user['user_id'], $prepared);
        if ($body === '') {
            $body = 'Файлы: ' . implode(', ', array_column($prepared, 'name'));
        }
        $pdo->prepare('UPDATE tasks SET comments_count = comments_count + 1 WHERE id = ?')->execute([$id]);

        $actor = (int) $user['user_id'];
        $mentioned = $this->mentionedUserIds($body);
        $this->recordMentions($id, $commentId, $actor, $mentioned);
        foreach ($mentioned as $userId) {
            if ($userId !== $actor) {
                $this->notifications->notify($userId, 'task_mention', 'Вас упомянули: ' . $current['title'], mb_substr($body, 0, 200), $this->url($id), 'mention-' . $commentId . '-' . $userId);
            }
        }
        $others = array_diff($this->participantIds($id, $current), $mentioned);
        $this->notifications->notifyMany(array_values($others), $actor, 'task_comment', 'Комментарий: ' . $current['title'], mb_substr($body, 0, 200), $this->url($id), 'comment-' . $commentId);

        return $this->show($user, $id) ?? [];
    }

    /**
     * Only the author edits a comment: text, adding files, removing files of this comment.
     *
     * @param array<string, mixed> $user
     * @param list<int> $removeIds
     * @param list<array<string, mixed>> $files
     */
    public function editComment(array $user, int $commentId, ?string $body, array $removeIds, array $files): array
    {
        $pdo = Database::pdo();
        $stmt = $pdo->prepare('SELECT * FROM task_comments WHERE id = ?');
        $stmt->execute([$commentId]);
        $comment = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$comment) {
            throw new AppException('Комментарий не найден', 404);
        }
        $taskId = (int) $comment['task_id'];
        $this->visibleRow($user, $taskId);
        if ((int) $comment['user_id'] !== (int) $user['user_id']) {
            throw new AppException('Редактировать комментарий может только его автор', 403);
        }
        $existing = $pdo->prepare('SELECT * FROM task_comment_attachments WHERE comment_id = ?');
        $existing->execute([$commentId]);
        $current = [];
        foreach ($existing->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $current[(int) $row['id']] = $row;
        }
        $remove = array_values(array_intersect(array_keys($current), array_map('intval', $removeIds)));
        $prepared = $this->checkCommentFiles($files, count($current) - count($remove));
        $text = $body === null ? (string) $comment['body'] : trim($body);
        if ($text === '' && count($current) - count($remove) + count($prepared) === 0) {
            throw new AppException('Пустой комментарий');
        }
        if ($text === (string) $comment['body'] && $remove === [] && $prepared === []) {
            return $this->show($user, $taskId) ?? [];
        }
        $pdo->prepare('UPDATE task_comments SET body = ?, edited_at = NOW() WHERE id = ?')->execute([$text, $commentId]);
        foreach ($remove as $attachmentId) {
            $pdo->prepare('DELETE FROM task_comment_attachments WHERE id = ? AND comment_id = ?')->execute([$attachmentId, $commentId]);
            $this->removeFile((string) $current[$attachmentId]['stored_path']);
        }
        $this->storeCommentFiles($taskId, $commentId, (int) $user['user_id'], $prepared);

        // People newly mentioned by the edit get the same notification as for a new comment.
        $actor = (int) $user['user_id'];
        $before = $this->mentionedUserIds((string) $comment['body']);
        $added = array_values(array_diff($this->mentionedUserIds($text), $before));
        $this->recordMentions($taskId, $commentId, $actor, $added);
        $title = (string) ($this->row($taskId)['title'] ?? '');
        foreach ($added as $userId) {
            if ($userId !== $actor) {
                $this->notifications->notify($userId, 'task_mention', 'Вас упомянули: ' . $title, mb_substr($text, 0, 200), $this->url($taskId), 'mention-' . $commentId . '-' . $userId);
            }
        }

        return $this->show($user, $taskId) ?? [];
    }

    /**
     * @param array<string, mixed> $user
     * @return array{path:string,name:string,mime:string,size:int}
     */
    public function commentAttachmentFile(array $user, int $attachmentId): array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM task_comment_attachments WHERE id = ?');
        $stmt->execute([$attachmentId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Файл не найден', 404);
        }
        $this->visibleRow($user, (int) $row['task_id']);
        $path = $this->attachmentsDir() . '/' . $row['stored_path'];
        if (!is_file($path)) {
            throw new AppException('Файл не найден', 404);
        }

        return ['path' => $path, 'name' => (string) $row['original_name'], 'mime' => (string) $row['mime'], 'size' => (int) $row['size']];
    }

    /**
     * Validates every file before anything is saved, so a bad file leaves the comment untouched.
     *
     * @param list<array<string, mixed>> $files
     * @return list<array{tmp:string,name:string,mime:string,size:int,ext:string}>
     */
    private function checkCommentFiles(array $files, int $alreadyAttached): array
    {
        if ($files === []) {
            return [];
        }
        if ($alreadyAttached + count($files) > self::MAX_COMMENT_FILES) {
            throw new AppException('К комментарию можно прикрепить не больше ' . self::MAX_COMMENT_FILES . ' файлов');
        }
        $out = [];
        foreach ($files as $file) {
            $problem = AttachmentRules::rejection($file, 0);
            if ($problem !== null) {
                throw new AppException($problem);
            }
            $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
            $name = mb_substr(basename(str_replace('\\', '/', (string) ($file['name'] ?? 'file'))), 0, 255) ?: 'file';
            if (!isset(self::ALLOWED_MIME[$mime])) {
                throw new AppException('Такой тип файла не поддерживается: ' . $name);
            }
            $out[] = ['tmp' => (string) $file['tmp_name'], 'name' => $name, 'mime' => $mime, 'size' => (int) $file['size'], 'ext' => self::ALLOWED_MIME[$mime]];
        }

        return $out;
    }

    /** @param list<array{tmp:string,name:string,mime:string,size:int,ext:string}> $files */
    private function storeCommentFiles(int $taskId, int $commentId, int $userId, array $files): void
    {
        if ($files === []) {
            return;
        }
        if (\Trx\Config::get('app.demo_mode', false)) {
            throw new AppException('В демо-версии загрузка файлов отключена', 403);
        }
        $dir = $this->attachmentsDir() . '/' . $taskId . '/comments';
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new AppException('Не удалось сохранить файл', 500);
        }
        $insert = Database::pdo()->prepare('INSERT INTO task_comment_attachments (comment_id, task_id, user_id, original_name, stored_path, mime, size) VALUES (?,?,?,?,?,?,?)');
        foreach ($files as $file) {
            $relative = $taskId . '/comments/' . bin2hex(random_bytes(16)) . '.' . $file['ext'];
            if (!move_uploaded_file($file['tmp'], $this->attachmentsDir() . '/' . $relative)) {
                throw new AppException('Не удалось сохранить файл', 500);
            }
            $insert->execute([$commentId, $taskId, $userId, $file['name'], $relative, $file['mime'], $file['size']]);
        }
    }

    /** @param array<string, mixed> $user */
    public function addCheckItem(array $user, int $id, string $title): array
    {
        $this->visibleRow($user, $id);
        $title = trim($title);
        if ($title === '') {
            throw new AppException('Пустой пункт');
        }
        $pdo = Database::pdo();
        $next = (int) $pdo->query('SELECT COALESCE(MAX(sort_order), -1) + 1 FROM task_checklist WHERE task_id = ' . $id)->fetchColumn();
        $pdo->prepare('INSERT INTO task_checklist (task_id, title, sort_order) VALUES (?,?,?)')->execute([$id, mb_substr($title, 0, 255), $next]);

        return $this->show($user, $id) ?? [];
    }

    /** @param array<string, mixed> $user */
    public function toggleCheck(array $user, int $taskId, int $itemId, bool $done): array
    {
        $this->visibleRow($user, $taskId);
        Database::pdo()->prepare('UPDATE task_checklist SET is_done = ? WHERE id = ? AND task_id = ?')->execute([$done ? 1 : 0, $itemId, $taskId]);

        return $this->show($user, $taskId) ?? [];
    }

    /** @param array<string, mixed> $user */
    public function removeCheckItem(array $user, int $taskId, int $itemId): array
    {
        $this->requireUpdate($user);
        $this->visibleRow($user, $taskId);
        Database::pdo()->prepare('DELETE FROM task_checklist WHERE id = ? AND task_id = ?')->execute([$itemId, $taskId]);

        return $this->show($user, $taskId) ?? [];
    }

    /**
     * @param array<string, mixed> $user
     * @param array{name?:string,type?:string,tmp_name?:string,error?:int,size?:int}|null $file
     */
    public function addAttachment(array $user, int $taskId, ?array $file): array
    {
        $this->requireUpdate($user);
        $this->visibleRow($user, $taskId);
        if (\Trx\Config::get('app.demo_mode', false)) {
            throw new AppException('В демо-версии загрузка файлов отключена', 403);
        }
        $problem = AttachmentRules::rejection($file, (int) ($_SERVER['CONTENT_LENGTH'] ?? 0));
        if ($problem !== null || $file === null) {
            throw new AppException($problem ?? AttachmentRules::MISSING);
        }
        $size = (int) ($file['size'] ?? 0);
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file((string) $file['tmp_name']);
        if (!isset(self::ALLOWED_MIME[$mime])) {
            throw new AppException('Такой тип файла не поддерживается');
        }
        $dir = $this->attachmentsDir() . '/' . $taskId;
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new AppException('Не удалось сохранить файл', 500);
        }
        $relative = $taskId . '/' . bin2hex(random_bytes(16)) . '.' . self::ALLOWED_MIME[$mime];
        if (!move_uploaded_file((string) $file['tmp_name'], $this->attachmentsDir() . '/' . $relative)) {
            throw new AppException('Не удалось сохранить файл', 500);
        }
        $name = mb_substr(basename(str_replace('\\', '/', (string) ($file['name'] ?? 'file'))), 0, 255) ?: 'file';
        $pdo = Database::pdo();
        $pdo->prepare('INSERT INTO task_attachments (task_id, user_id, original_name, stored_path, mime, size) VALUES (?,?,?,?,?,?)')
            ->execute([$taskId, (int) $user['user_id'], $name, $relative, $mime, $size]);
        $this->syncAttachmentCount($taskId);
        $this->history($taskId, (int) $user['user_id'], 'attachment_added', '', $name);

        return $this->show($user, $taskId) ?? [];
    }

    /**
     * @param array<string, mixed> $user
     * @return array{path:string,name:string,mime:string,size:int}
     */
    public function attachmentFile(array $user, int $attachmentId): array
    {
        $row = $this->attachment($attachmentId);
        $this->visibleRow($user, (int) $row['task_id']);
        $path = $this->attachmentsDir() . '/' . $row['stored_path'];
        if (!is_file($path)) {
            throw new AppException('Файл не найден', 404);
        }

        return ['path' => $path, 'name' => (string) $row['original_name'], 'mime' => (string) $row['mime'], 'size' => (int) $row['size']];
    }

    /** @param array<string, mixed> $user */
    public function deleteAttachment(array $user, int $attachmentId): array
    {
        $row = $this->attachment($attachmentId);
        $taskId = (int) $row['task_id'];
        $task = $this->visibleRow($user, $taskId);
        $actor = (int) $user['user_id'];
        $allowed = $actor === (int) $row['user_id'] || $actor === (int) $task['creator_id'] || $user['role_slug'] === 'owner';
        if (!$allowed) {
            throw new AppException('Удалить файл может автор, постановщик или владелец', 403);
        }
        Database::pdo()->prepare('DELETE FROM task_attachments WHERE id = ?')->execute([$attachmentId]);
        $this->removeFile((string) $row['stored_path']);
        $this->syncAttachmentCount($taskId);
        $this->history($taskId, $actor, 'attachment_removed', (string) $row['original_name'], '');

        return $this->show($user, $taskId) ?? [];
    }

    /**
     * Reminders before the deadline (thresholds in settings.task_remind_hours) and once-a-day overdue notices.
     */
    public function remindDue(): int
    {
        $pdo = Database::pdo();
        $thresholds = array_values(array_filter(
            array_map('intval', (array) $this->settings->get('task_remind_hours', [24, 2])),
            static fn (int $h) => $h > 0
        ));
        rsort($thresholds);
        $sent = 0;

        $upcoming = $pdo->query(
            "SELECT id, title, assignee_id, creator_id, due_at, TIMESTAMPDIFF(MINUTE, NOW(), due_at) AS minutes_left
             FROM tasks
             WHERE status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at >= NOW()
             AND due_at < DATE_ADD(NOW(), INTERVAL " . (max($thresholds ?: [24])) . ' HOUR)'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($upcoming as $row) {
            $minutesLeft = (int) $row['minutes_left'];
            $threshold = null;
            foreach ($thresholds as $hours) {
                if ($minutesLeft <= $hours * 60) {
                    $threshold = $hours;
                }
            }
            if ($threshold === null) {
                continue;
            }
            $key = 'due-' . $row['id'] . '-' . $threshold . 'h-' . $row['due_at'];
            $body = $row['title'] . ' — срок ' . date('d.m H:i', (int) strtotime((string) $row['due_at']));
            foreach ($this->storedAssigneeIds((int) $row['id'], (int) $row['assignee_id']) as $userId) {
                if ($this->notifications->notify($userId, 'task_due_soon', 'Скоро срок задачи', $body, $this->url((int) $row['id']), $key)) {
                    $sent++;
                }
            }
        }

        $overdue = $pdo->query(
            "SELECT id, title, assignee_id, creator_id FROM tasks
             WHERE status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND due_at < NOW()"
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $today = date('Y-m-d');
        foreach ($overdue as $row) {
            $recipients = array_values(array_unique(array_merge(
                $this->storedAssigneeIds((int) $row['id'], (int) $row['assignee_id']),
                [(int) $row['creator_id']]
            )));
            foreach ($recipients as $userId) {
                if ($this->notifications->notify($userId, 'task_overdue', 'Задача просрочена', (string) $row['title'], $this->url((int) $row['id']), 'overdue-' . $row['id'] . '-' . $today)) {
                    $sent++;
                }
            }
        }

        return $sent;
    }

    /** @param array<string, mixed>|null $viewer @return list<array<string, mixed>> */
    public function users(?array $viewer = null): array
    {
        $hide = $viewer !== null && \Trx\Security\Policy::isSuperadmin($viewer) ? '' : ' AND ' . \Trx\Security\Policy::hideSuperadminSql('u');

        return Database::pdo()->query(
            'SELECT u.id, u.name, u.initials, u.department_id, r.slug AS role_slug, r.name AS role_name, d.name AS department_name, d.color AS department_color
             FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.is_active = 1' . $hide . ' ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $task
     * @return array<string, bool>
     */
    private function abilities(array $user, array $task): array
    {
        $actor = (int) $user['user_id'];
        $isOwner = $user['role_slug'] === 'owner';
        $isCreator = $actor === (int) $task['creator_id'] || $isOwner;
        $canUpdate = $this->policy->can($user, 'tasks', 'update');
        $open = !in_array($task['status'], ['done', 'cancelled'], true);

        return [
            'edit' => $canUpdate && ($open || $isOwner),
            'delete' => $this->policy->can($user, 'tasks', 'delete'),
            'accept' => $canUpdate && $isCreator && $task['status'] === 'on_review',
            'return' => $canUpdate && $isCreator && $task['status'] === 'on_review',
            'transition' => $canUpdate && $open,
        ];
    }

    /**
     * @param array<string, mixed> $current
     * @param array<string, mixed> $input
     */
    private function notifyTransition(int $id, array $current, string $to, int $actor, array $input): void
    {
        $title = (string) $current['title'];
        $url = $this->url($id);
        $creator = (int) $current['creator_id'];
        $assignees = $this->storedAssigneeIds($id, (int) $current['assignee_id']);
        $key = 'status-' . $id . '-' . $to . '-' . time();
        if ($to === 'on_review' && $creator !== $actor) {
            $this->notifications->notify($creator, 'task_review', 'Задача на проверке', $title, $url, $key);
        }
        if ($to === 'done') {
            $this->notifications->notifyMany($assignees, $actor, 'task_done', 'Результат принят', $title, $url, $key);
        }
        if ($current['status'] === 'on_review' && $to === 'in_progress') {
            $this->notifications->notifyMany($assignees, $actor, 'task_returned', 'Задача возвращена', $title . ': ' . trim((string) ($input['comment'] ?? '')), $url, $key);
        }
    }

    /** @param array<string, mixed> $current */
    private function notifyParticipants(int $id, array $current, int $actor, string $kind, string $title, string $body): void
    {
        $this->notifications->notifyMany($this->participantIds($id, $current), $actor, $kind, $title, $body, $this->url($id), $kind . '-' . $id . '-' . time());
    }

    /**
     * @param array<string, mixed> $current
     * @return list<int>
     */
    private function participantIds(int $id, array $current): array
    {
        return array_values(array_unique(array_merge(
            [(int) $current['creator_id']],
            $this->storedAssigneeIds($id, (int) $current['assignee_id'])
        )));
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $current
     * @param array<string, mixed> $input
     */
    private function changeAssignees(array $user, int $id, array $current, array $input): bool
    {
        $next = $this->assigneeIdsFromInput($input, null);
        $prev = $this->storedAssigneeIds($id, (int) $current['assignee_id']);
        $this->assertAssigneeSet($next, $prev);
        if ($next === $prev) {
            return false;
        }
        $this->replaceAssigneeRows($id, $next);
        Database::pdo()->prepare('UPDATE tasks SET assignee_id = ?, updated_at = NOW() WHERE id = ?')->execute([$next[0], $id]);
        $actor = (int) $user['user_id'];
        $this->history($id, $actor, 'assignees', $this->assigneeNames($prev), $this->assigneeNames($next));
        $this->audit->log($actor, 'task', (string) $id, 'update', ['assignee_ids' => $prev], ['assignee_ids' => $next]);
        $title = (string) $current['title'];
        foreach (array_diff($next, $prev) as $assigneeId) {
            if ((int) $assigneeId !== $actor) {
                $this->notifications->notify((int) $assigneeId, 'task_assigned', 'Вам назначена задача', $title, $this->url($id), 'task-assign-' . $id . '-' . $assigneeId);
            }
        }

        return true;
    }

    /**
     * @param array<string, mixed> $input
     * @return list<int>
     */
    private function assigneeIdsFromInput(array $input, ?int $fallbackUserId): array
    {
        if (array_key_exists('assignee_ids', $input)) {
            if (!is_array($input['assignee_ids'])) {
                throw new AppException('Укажите ответственных');
            }
            $raw = $input['assignee_ids'];
        } elseif (array_key_exists('assignee_id', $input)) {
            $raw = [$input['assignee_id']];
        } elseif ($fallbackUserId !== null && $fallbackUserId > 0) {
            $raw = [$fallbackUserId];
        } else {
            $raw = [];
        }
        $ids = [];
        foreach ($raw as $id) {
            $id = (int) $id;
            if ($id > 0 && !in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }
        if ($ids === []) {
            throw new AppException('Выберите хотя бы одного ответственного');
        }

        return $ids;
    }

    /**
     * @param list<int> $ids
     * @param list<int> $already
     */
    private function assertAssigneeSet(array $ids, array $already = []): void
    {
        if ($ids === []) {
            throw new AppException('Выберите хотя бы одного ответственного');
        }
        foreach ($ids as $id) {
            if (in_array($id, $already, true)) {
                $stmt = Database::pdo()->prepare('SELECT 1 FROM users WHERE id = ?');
                $stmt->execute([$id]);
                if (!$stmt->fetchColumn()) {
                    throw new AppException('Сотрудник не найден');
                }
                continue;
            }
            $this->assertActiveUser($id);
        }
    }

    /** @param list<int> $ids */
    private function replaceAssigneeRows(int $taskId, array $ids): void
    {
        $pdo = Database::pdo();
        $pdo->prepare('DELETE FROM task_assignees WHERE task_id = ?')->execute([$taskId]);
        $stmt = $pdo->prepare('INSERT INTO task_assignees (task_id, user_id, position) VALUES (?,?,?)');
        foreach (array_values($ids) as $position => $userId) {
            $stmt->execute([$taskId, $userId, $position]);
        }
    }

    /** @return list<int> */
    private function storedAssigneeIds(int $taskId, int $fallback = 0): array
    {
        $stmt = Database::pdo()->prepare('SELECT user_id FROM task_assignees WHERE task_id = ? ORDER BY position, user_id');
        $stmt->execute([$taskId]);
        $ids = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id) {
            $id = (int) $id;
            if ($id > 0 && !in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }
        if ($ids === [] && $fallback > 0) {
            return [$fallback];
        }

        return $ids;
    }

    /** @param list<int> $ids */
    private function assigneeNames(array $ids): string
    {
        $names = [];
        foreach ($ids as $id) {
            $names[] = $this->userName($id);
        }

        return implode(', ', $names);
    }

    /** @return list<int> */
    /**
     * Stores an unread mention for each mentioned person who can open the task, so the
     * badge and list highlight only count tasks the person can actually clear.
     *
     * @param list<int> $userIds
     */
    private function recordMentions(int $taskId, int $commentId, int $actor, array $userIds): void
    {
        if ($userIds === []) {
            return;
        }
        $roles = [];
        foreach ($this->users() as $row) {
            $roles[(int) $row['id']] = (string) $row['role_slug'];
        }
        $insert = Database::pdo()->prepare('INSERT IGNORE INTO task_mentions (comment_id, task_id, user_id) VALUES (?,?,?)');
        foreach (array_unique($userIds) as $userId) {
            if ($userId === $actor || !isset($roles[$userId])) {
                continue;
            }
            if ($this->tasks->find(['user_id' => $userId, 'role_slug' => $roles[$userId]], $taskId) === null) {
                continue;
            }
            $insert->execute([$commentId, $taskId, $userId]);
        }
    }

    private function mentionedUserIds(string $body): array
    {
        if (!str_contains($body, '@')) {
            return [];
        }
        $ids = [];
        $haystack = mb_strtolower($body);
        foreach ($this->users() as $row) {
            if (str_contains($haystack, '@' . mb_strtolower((string) $row['name']))) {
                $ids[] = (int) $row['id'];
            }
        }

        return $ids;
    }

    /**
     * @param array<string, mixed> $user
     * @return array<string, mixed>
     */
    private function visibleRow(array $user, int $id): array
    {
        $row = $this->row($id);
        if (!$row || !$this->tasks->find($user, $id)) {
            throw new AppException('Задача не найдена', 404);
        }

        return $row;
    }

    /** @param array<string, mixed> $user */
    private function requireUpdate(array $user): void
    {
        if (!$this->policy->can($user, 'tasks', 'update')) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @return array<string, mixed> */
    private function template(int $id): array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM task_templates WHERE id = ? AND is_active = 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Шаблон не найден', 404);
        }

        return $row;
    }

    private function assertActiveUser(int $userId): void
    {
        $stmt = Database::pdo()->prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$userId]);
        if (!$stmt->fetchColumn()) {
            throw new AppException('Сотрудник не найден или отключён');
        }
    }

    private function assertDepartment(int $deptId): void
    {
        $stmt = Database::pdo()->prepare('SELECT 1 FROM departments WHERE id = ?');
        $stmt->execute([$deptId]);
        if (!$stmt->fetchColumn()) {
            throw new AppException('Отдел не найден');
        }
    }

    private function assertDateOrder(?string $startsAt, ?string $dueAt): void
    {
        if ($startsAt !== null && $dueAt !== null && strtotime($startsAt) > strtotime($dueAt)) {
            throw new AppException('Начало не может быть позже срока');
        }
    }

    private function historyValue(string $field, mixed $value): string
    {
        if ($field === 'is_urgent') {
            return (int) $value === 1 ? 'да' : 'нет';
        }
        if ($value === null || $value === '') {
            return '';
        }

        return match ($field) {
            'assignee_id' => $this->userName((int) $value),
            'department_id' => $this->departmentName((int) $value),
            default => (string) $value,
        };
    }

    private function urgentFlag(mixed $value): int
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }
        if (is_int($value) || is_float($value)) {
            return (int) $value === 1 ? 1 : 0;
        }
        if (is_string($value)) {
            return in_array(strtolower(trim($value)), ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
        }

        return 0;
    }

    /** @param list<int> $assigneeIds */
    private function notifyUrgent(int $taskId, string $title, array $assigneeIds): void
    {
        $heading = 'Срочная задача: ' . $title;
        $stamp = (string) hrtime(true);
        foreach (array_unique(array_map('intval', $assigneeIds)) as $assigneeId) {
            $this->notifications->notify(
                $assigneeId,
                'task_urgent',
                $heading,
                $title,
                $this->url($taskId),
                'task-urgent-' . $taskId . '-' . $assigneeId . '-' . $stamp
            );
        }
    }

    private function userName(int $id): string
    {
        $stmt = Database::pdo()->prepare('SELECT name FROM users WHERE id = ?');
        $stmt->execute([$id]);

        return (string) ($stmt->fetchColumn() ?: '#' . $id);
    }

    private function departmentName(int $id): string
    {
        $stmt = Database::pdo()->prepare('SELECT name FROM departments WHERE id = ?');
        $stmt->execute([$id]);

        return (string) ($stmt->fetchColumn() ?: '#' . $id);
    }

    /** @return array<string, mixed> */
    private function attachment(int $id): array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM task_attachments WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Файл не найден', 404);
        }

        return $row;
    }

    /** @return list<array<string, mixed>> */
    private function attachmentRows(int $taskId): array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM task_attachments WHERE task_id = ?');
        $stmt->execute([$taskId]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    private function syncAttachmentCount(int $taskId): void
    {
        Database::pdo()->prepare('UPDATE tasks SET attachments_count = (SELECT COUNT(*) FROM task_attachments WHERE task_id = ?) WHERE id = ?')
            ->execute([$taskId, $taskId]);
    }

    private function attachmentsDir(): string
    {
        return rtrim((string) Config::get('paths.storage', dirname(__DIR__, 2) . '/storage'), '/') . '/attachments';
    }

    private function removeFile(string $relative): void
    {
        $path = $this->attachmentsDir() . '/' . $relative;
        if (is_file($path)) {
            unlink($path);
        }
    }

    private function url(int $taskId): string
    {
        return '/tasks?task=' . $taskId;
    }

    /** @return array<string, mixed>|null */
    private function row(int $id): ?array
    {
        $stmt = Database::pdo()->prepare('SELECT * FROM tasks WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ?: null;
    }

    private function history(int $taskId, int $userId, string $field, string $old, string $new): void
    {
        if ($old === $new) {
            return;
        }
        Database::pdo()->prepare(
            'INSERT INTO task_history (task_id, user_id, field_name, old_value, new_value) VALUES (?,?,?,?,?)'
        )->execute([$taskId, $userId, $field, mb_substr($old, 0, 255), mb_substr($new, 0, 255)]);
    }

    private function dateTimeOrNull(mixed $value): ?string
    {
        if (!is_string($value) || trim($value) === '') {
            return null;
        }
        $ts = strtotime($value);
        if ($ts === false) {
            throw new AppException('Неверный формат даты');
        }

        return date('Y-m-d H:i:s', $ts);
    }
}
