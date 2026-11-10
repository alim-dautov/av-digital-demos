<?php

declare(strict_types=1);

namespace Trx\Repositories;

use PDO;
use Trx\Database;
use Trx\Security\Policy;

final class TaskRepository
{
    public function __construct(private readonly Policy $policy = new Policy())
    {
    }

    /**
     * Fingerprint of everything a task list or board shows. Content-based rather than max(updated_at),
     * so two changes within the same second are still noticed.
     */
    /** @param array<string, mixed> $user */
    public function version(array $user): string
    {
        $sql = "SELECT COUNT(*) AS n, COALESCE(BIT_XOR(CRC32(CONCAT_WS('|', t.id, t.status, t.title, t.priority, t.assignee_id, t.is_urgent, IFNULL(t.department_id, ''),
                    IFNULL(t.due_at, ''), t.comments_count, t.attachments_count, IFNULL(t.cancel_reason, ''), t.updated_at,
                    IFNULL((SELECT GROUP_CONCAT(ta.user_id ORDER BY ta.position SEPARATOR ',') FROM task_assignees ta WHERE ta.task_id = t.id), '')))), 0) AS h
             FROM tasks t WHERE 1=1";
        $params = [];
        $this->limitToVisible($user, $sql, $params);
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $seen = Database::pdo()->prepare(
            'SELECT COUNT(*) AS n, COALESCE(BIT_XOR(CRC32(task_id)), 0) AS h FROM task_reads WHERE user_id = ?'
        );
        $seen->execute([(int) ($user['user_id'] ?? 0)]);
        $seenRow = $seen->fetch(PDO::FETCH_ASSOC) ?: ['n' => 0, 'h' => 0];

        return $row['n'] . '-' . $row['h'] . '-' . $seenRow['n'] . '-' . $seenRow['h'];
    }

    /**
     * Tasks where this user is responsible, did not create the task, and has never opened the card.
     *
     * @param array<string, mixed> $user
     */
    public function unseenCount(array $user): int
    {
        $userId = (int) ($user['user_id'] ?? 0);
        if ($userId <= 0) {
            return 0;
        }
        $stmt = Database::pdo()->prepare(
            'SELECT COUNT(*) FROM tasks t
             WHERE t.creator_id <> ?
               AND (
                    EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
                    OR t.assignee_id = ?
               )
               AND NOT EXISTS (SELECT 1 FROM task_reads tr WHERE tr.task_id = t.id AND tr.user_id = ?)'
        );
        $stmt->execute([$userId, $userId, $userId, $userId]);

        return (int) $stmt->fetchColumn();
    }

    /** Unread @mentions of this user in tasks the user can still open. */
    public function unreadMentionCount(array $user): int
    {
        $userId = (int) ($user['user_id'] ?? 0);
        if ($userId <= 0) {
            return 0;
        }
        $stmt = Database::pdo()->prepare('SELECT COUNT(*) FROM task_mentions m JOIN tasks t ON t.id = m.task_id WHERE m.user_id = ? AND m.read_at IS NULL');
        $stmt->execute([$userId]);

        return (int) $stmt->fetchColumn();
    }

    public function markMentionsRead(int $userId, int $taskId): void
    {
        if ($userId <= 0 || $taskId <= 0) {
            return;
        }
        Database::pdo()->prepare('UPDATE task_mentions SET read_at = NOW() WHERE user_id = ? AND task_id = ? AND read_at IS NULL')->execute([$userId, $taskId]);
    }

    public function markSeen(int $userId, int $taskId): void
    {
        if ($userId <= 0 || $taskId <= 0) {
            return;
        }
        Database::pdo()->prepare('INSERT IGNORE INTO task_reads (task_id, user_id) VALUES (?, ?)')->execute([$taskId, $userId]);
    }

    /** @param array<string, mixed> $user */
    public function list(array $user, array $filters = []): array
    {
        $sql = $this->baseSql();
        $params = [];
        $this->limitToVisible($user, $sql, $params);

        if (!empty($filters['id'])) {
            $sql .= ' AND t.id = ?';
            $params[] = (int) $filters['id'];
        }
        $scope = (string) ($filters['scope'] ?? '');
        if ($scope === 'mine') {
            $this->whereResponsible($sql, $params, (int) $user['user_id']);
        }
        if ($scope === 'created') {
            $sql .= ' AND t.creator_id = ?';
            $params[] = (int) $user['user_id'];
        }
        if ($scope === 'watching') {
            // Watchers are no longer part of the product. Old links must not read task_watchers.
            $sql .= ' AND 1 = 0';
        }
        if ($scope === 'on_review') {
            $sql .= " AND t.status = 'on_review'";
        }
        if ($scope === 'overdue') {
            $sql .= " AND t.due_at < NOW() AND t.status NOT IN ('done','cancelled')";
        }
        if (!empty($filters['status'])) {
            $statuses = array_values(array_intersect(
                explode(',', (string) $filters['status']),
                ['new', 'in_progress', 'on_review', 'done', 'cancelled']
            ));
            if ($statuses !== []) {
                $sql .= ' AND t.status IN (' . implode(',', array_fill(0, count($statuses), '?')) . ')';
                array_push($params, ...$statuses);
            }
        }
        if (!empty($filters['department_id'])) {
            $sql .= ' AND t.department_id = ?';
            $params[] = (int) $filters['department_id'];
        }
        if (!empty($filters['assignee_id'])) {
            $this->whereResponsible($sql, $params, (int) $filters['assignee_id']);
        }
        if (!empty($filters['priority'])) {
            $sql .= ' AND t.priority = ?';
            $params[] = $filters['priority'];
        }
        if (!empty($filters['q'])) {
            $sql .= ' AND (t.title LIKE ? OR t.number LIKE ? OR a.name LIKE ?
                OR EXISTS (
                    SELECT 1 FROM task_assignees tas
                    JOIN users tu ON tu.id = tas.user_id
                    WHERE tas.task_id = t.id AND tu.name LIKE ?
                ))';
            $q = '%' . $filters['q'] . '%';
            $params[] = $q;
            $params[] = $q;
            $params[] = $q;
            $params[] = $q;
        }
        if (($filters['due'] ?? '') === 'overdue') {
            $sql .= " AND t.due_at < NOW() AND t.status NOT IN ('done','cancelled')";
        }
        if (($filters['due'] ?? '') === 'today') {
            $sql .= " AND DATE(t.due_at) = CURDATE() AND t.status NOT IN ('done','cancelled')";
        }
        if (($filters['due'] ?? '') === 'none') {
            $sql .= " AND t.due_at IS NULL AND t.status NOT IN ('done','cancelled')";
        }
        if (($filters['due'] ?? '') === 'week') {
            $sql .= ' AND YEARWEEK(t.due_at, 1) = YEARWEEK(CURDATE(), 1)';
        }
        if (!empty($filters['from'])) {
            $sql .= ' AND t.due_at >= ?';
            $params[] = (string) $filters['from'] . ' 00:00:00';
        }
        if (!empty($filters['to'])) {
            $sql .= ' AND t.due_at <= ?';
            $params[] = (string) $filters['to'] . ' 23:59:59';
        }
        if (($filters['attention'] ?? '') === 'overdue') {
            $sql .= " AND t.due_at < NOW() AND t.status NOT IN ('done','cancelled')";
        }
        if (($filters['attention'] ?? '') === 'on_review') {
            $sql .= " AND t.status = 'on_review'";
        }

        $sql .= ' ORDER BY t.is_urgent DESC, t.due_at IS NULL, t.due_at ASC, t.id DESC LIMIT 500';
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $row) {
            if ($this->policy->canViewTask($user, $row)) {
                $out[] = $this->map($row);
            }
        }

        return $this->annotateUnseen($user, $this->withAssignees($out));
    }

    /** @var list<string> */
    private const BASE_WIDGETS = ['kpi_today', 'kpi_overdue', 'kpi_review', 'kpi_no_due', 'attention', 'team_load', 'by_department', 'week'];

    /**
     * @param array<string, mixed> $user
     * @param array{department_id?:int|string,period?:string} $filters
     */
    public function dashboard(array $user, array $filters = []): array
    {
        $all = $this->list($user, array_filter(['department_id' => $filters['department_id'] ?? '']));
        $today = [];
        $overdue = [];
        $review = [];
        $noDue = [];
        $byDept = [];
        $byUser = [];

        $tz = new \DateTimeZone('Asia/Almaty');
        $now = new \DateTimeImmutable('now', $tz);
        $todayDate = $now->format('Y-m-d');
        [$periodFrom, $periodTo] = match ($filters['period'] ?? 'week') {
            'today' => [$todayDate, $todayDate],
            'month' => [$now->modify('first day of this month')->format('Y-m-d'), $now->modify('last day of this month')->format('Y-m-d')],
            'all' => [null, null],
            default => [(new \DateTimeImmutable('monday this week', $tz))->format('Y-m-d'), (new \DateTimeImmutable('sunday this week', $tz))->format('Y-m-d')],
        };
        $inPeriod = static function (array $task) use ($periodFrom, $periodTo): bool {
            if ($periodFrom === null || !$task['due_at'] || $task['is_overdue']) {
                return true;
            }
            $due = substr((string) $task['due_at'], 0, 10);

            return $due >= $periodFrom && $due <= $periodTo;
        };

        foreach ($all as $task) {
            $status = $task['status'];
            $due = $task['due_at'] ? substr($task['due_at'], 0, 10) : null;
            $open = !in_array($status, ['done', 'cancelled'], true);

            if ($open && $due === $todayDate) {
                $today[] = $task;
            }
            if ($open && $task['is_overdue']) {
                $overdue[] = $task;
            }
            if ($status === 'on_review') {
                $review[] = $task;
            }
            if ($open && $due === null) {
                $noDue[] = $task;
            }
            if ($open && $inPeriod($task)) {
                $slug = (string) ($task['department_slug'] ?? '');
                if ($slug !== '') {
                    if (!isset($byDept[$slug])) {
                        $byDept[$slug] = [
                            'slug' => $slug,
                            'name' => $task['department_name'],
                            'color' => $task['department_color'],
                            'count' => 0,
                        ];
                    }
                    $byDept[$slug]['count']++;
                }

                $people = $task['assignees'] ?? [];
                if ($people === []) {
                    $people = [[
                        'id' => $task['assignee_id'],
                        'name' => $task['assignee_name'],
                        'initials' => $task['assignee_initials'],
                        'role' => $task['assignee_role'],
                    ]];
                }
                foreach ($people as $person) {
                    $uid = (int) $person['id'];
                    if (!isset($byUser[$uid])) {
                        $byUser[$uid] = [
                            'id' => $uid,
                            'name' => $person['name'],
                            'initials' => $person['initials'],
                            'role' => $person['role'] ?? '',
                            'count' => 0,
                            'color' => $task['department_color'] ?: '#8B909A',
                        ];
                    }
                    $byUser[$uid]['count']++;
                }
            }
        }

        usort($byUser, static fn ($a, $b) => $b['count'] <=> $a['count']);
        $deptList = array_values($byDept);
        usort($deptList, static fn ($a, $b) => $b['count'] <=> $a['count']);

        $weekOffset = (int) ($filters['week_offset'] ?? 0);
        $weekStart = $now->setTime(0, 0)->modify(($weekOffset * 7) . ' days');
        $week = [];
        for ($i = 0; $i < 7; $i++) {
            $day = $weekStart->modify("+{$i} days");
            $key = $day->format('Y-m-d');
            $week[$key] = [
                'date' => $key,
                'label' => $day->format('d'),
                'weekday' => ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'][(int) $day->format('N') - 1],
                'is_today' => $key === $todayDate,
                'is_weekend' => (int) $day->format('N') >= 6,
                'tasks' => [],
            ];
        }
        foreach ($all as $task) {
            if (!$task['due_at']) {
                continue;
            }
            $key = substr($task['due_at'], 0, 10);
            if (isset($week[$key])) {
                $week[$key]['tasks'][] = [
                    'id' => $task['id'],
                    'title' => $task['title'],
                    'color' => $task['department_color'] ?: '#8B909A',
                    'status' => $task['status'],
                ];
            }
        }

        $attentionAll = array_values(array_filter(
            $all,
            static fn ($t) => $inPeriod($t) && ($t['is_overdue'] || $t['status'] === 'on_review' || (
                $t['due_label'] === 'Сегодня' && !in_array($t['status'], ['done', 'cancelled'], true)
            ))
        ));
        $attention = array_slice($attentionAll, 0, 12);

        $canSales = $this->policy->can($user, 'sales', 'view');
        $isOwner = ($user['role_slug'] ?? '') === 'owner';
        $widgets = self::BASE_WIDGETS;
        if ($canSales) {
            $widgets[] = 'new_leads';
            $widgets[] = 'deals_no_next';
        }
        if ($isOwner) {
            $widgets[] = 'integration_errors';
        }

        return [
            'widgets' => $widgets,
            'filters' => ['department_id' => $filters['department_id'] ?? '', 'period' => $filters['period'] ?? 'week', 'from' => $periodFrom, 'to' => $periodTo],
            'kpi' => [
                'today' => count($today),
                'overdue' => count($overdue),
                'on_review' => count($review),
                'no_due' => count($noDue),
                'new_leads' => $canSales ? $this->newLeadsCount($user) : null,
                'deals_no_next' => $canSales ? $this->dealsWithoutNextCount($user) : null,
                'integration_errors' => $isOwner ? $this->integrationErrorsCount() : null,
            ],
            'attention_counts' => [
                'all' => count($attentionAll),
                'overdue' => count(array_filter($attentionAll, static fn ($t) => $t['is_overdue'])),
                'on_review' => count(array_filter($attentionAll, static fn ($t) => $t['status'] === 'on_review')),
            ],
            'attention' => $attention,
            'team_load' => array_slice(array_values($byUser), 0, 8),
            'by_department' => $deptList,
            'week' => array_values($week),
        ];
    }

    /** @param array<string, mixed> $user */
    private function newLeadsCount(array $user): int
    {
        [$scopeSql, $params] = $this->dealScope($user);
        $stmt = Database::pdo()->prepare(
            "SELECT COUNT(*) FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
             WHERE s.slug = 'new_lead' AND d.is_test = 0 {$scopeSql}"
        );
        $stmt->execute($params);

        return (int) $stmt->fetchColumn();
    }

    /** @param array<string, mixed> $user */
    private function dealsWithoutNextCount(array $user): int
    {
        [$scopeSql, $params] = $this->dealScope($user);
        $stmt = Database::pdo()->prepare(
            "SELECT COUNT(*) FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
             WHERE s.is_won = 0 AND s.is_lost = 0 AND d.is_test = 0 {$scopeSql}
             AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.deal_id = d.id AND t.status NOT IN ('done','cancelled'))"
        );
        $stmt->execute($params);

        return (int) $stmt->fetchColumn();
    }

    private function integrationErrorsCount(): int
    {
        return (int) Database::pdo()->query(
            "SELECT COUNT(*) FROM jobs WHERE status = 'failed' AND updated_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"
        )->fetchColumn();
    }

    /**
     * @param array<string, mixed> $user
     * @return array{0:string,1:list<int>}
     */
    private function dealScope(array $user): array
    {
        unset($user);

        return ['', []];
    }

    /** @param array<string, mixed> $user */
    public function find(array $user, int $id): ?array
    {
        if ($id <= 0) {
            return null;
        }

        return $this->list($user, ['id' => $id])[0] ?? null;
    }

    /** Task the caller just wrote, even if it is assigned to someone else. */
    public function present(int $id): ?array
    {
        if ($id <= 0) {
            return null;
        }
        $stmt = Database::pdo()->prepare($this->baseSql() . ' AND t.id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? $this->withAssignees([$this->map($row)])[0] : null;
    }

    private function baseSql(): string
    {
        return 'SELECT t.*, d.slug AS department_slug, d.name AS department_name, d.color AS department_color,
                       a.name AS assignee_name, a.initials AS assignee_initials, a.deleted_at AS assignee_deleted_at, r.name AS assignee_role,
                       c.name AS creator_name, c.initials AS creator_initials, c.deleted_at AS creator_deleted_at,
                       (SELECT GROUP_CONCAT(ta.user_id ORDER BY ta.position SEPARATOR \',\') FROM task_assignees ta WHERE ta.task_id = t.id) AS assignee_ids_csv
                FROM tasks t
                LEFT JOIN departments d ON d.id = t.department_id
                JOIN users a ON a.id = t.assignee_id
                JOIN roles r ON r.id = a.role_id
                JOIN users c ON c.id = t.creator_id
                WHERE 1=1';
    }

    /**
     * @param array<string, mixed> $user
     * @param list<mixed> $params
     */
    private function limitToVisible(array $user, string &$sql, array &$params): void
    {
        if ($this->policy->seesAllTasks($user)) {
            return;
        }
        $this->whereResponsible($sql, $params, (int) ($user['user_id'] ?? 0));
    }

    /**
     * @param list<mixed> $params
     */
    private function whereResponsible(string &$sql, array &$params, int $userId): void
    {
        $sql .= ' AND (t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?))';
        $params[] = $userId;
        $params[] = $userId;
    }

    /**
     * @param list<array<string, mixed>> $tasks
     * @return list<array<string, mixed>>
     */
    private function withAssignees(array $tasks): array
    {
        if ($tasks === []) {
            return [];
        }
        $ids = array_map(static fn (array $task): int => (int) $task['id'], $tasks);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT ta.task_id, u.id, u.name, u.initials, u.deleted_at, r.name AS role_name
             FROM task_assignees ta
             JOIN users u ON u.id = ta.user_id
             JOIN roles r ON r.id = u.role_id
             WHERE ta.task_id IN ($placeholders)
             ORDER BY ta.task_id, ta.position, u.name"
        );
        $stmt->execute($ids);
        $grouped = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $grouped[(int) $row['task_id']][] = [
                'id' => (int) $row['id'],
                'name' => Policy::personName((string) $row['name'], $row['deleted_at'] ?? null),
                'initials' => (string) $row['initials'],
                'role' => (string) $row['role_name'],
            ];
        }
        foreach ($tasks as &$task) {
            $people = $grouped[(int) $task['id']] ?? [];
            if ($people === []) {
                $people = [[
                    'id' => (int) $task['assignee_id'],
                    'name' => (string) $task['assignee_name'],
                    'initials' => (string) $task['assignee_initials'],
                    'role' => (string) ($task['assignee_role'] ?? ''),
                ]];
            }
            $task['assignees'] = $people;
            $task['assignee_id'] = $people[0]['id'];
            $task['assignee_name'] = $people[0]['name'];
            $task['assignee_initials'] = $people[0]['initials'];
            $task['assignee_role'] = $people[0]['role'];
        }
        unset($task);

        return $tasks;
    }

    /**
     * @param array<string, mixed> $user
     * @param list<array<string, mixed>> $tasks
     * @return list<array<string, mixed>>
     */
    private function annotateUnseen(array $user, array $tasks): array
    {
        if ($tasks === []) {
            return [];
        }
        $userId = (int) ($user['user_id'] ?? 0);
        $ids = array_map(static fn (array $task): int => (int) $task['id'], $tasks);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT task_id FROM task_reads WHERE user_id = ? AND task_id IN ($placeholders)"
        );
        $stmt->execute([$userId, ...$ids]);
        $seen = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $taskId) {
            $seen[(int) $taskId] = true;
        }
        $mentionStmt = Database::pdo()->prepare(
            "SELECT task_id, COUNT(*) FROM task_mentions WHERE user_id = ? AND read_at IS NULL AND task_id IN ($placeholders) GROUP BY task_id"
        );
        $mentionStmt->execute([$userId, ...$ids]);
        $mentions = [];
        foreach ($mentionStmt->fetchAll(PDO::FETCH_NUM) ?: [] as [$taskId, $n]) {
            $mentions[(int) $taskId] = (int) $n;
        }
        foreach ($tasks as &$task) {
            $task['unread_mentions'] = $mentions[(int) $task['id']] ?? 0;
            $assigneeIds = array_map(
                static fn (array $person): int => (int) $person['id'],
                $task['assignees'] ?? []
            );
            if ($assigneeIds === []) {
                $assigneeIds = [(int) $task['assignee_id']];
            }
            $task['unseen'] = $userId > 0
                && in_array($userId, $assigneeIds, true)
                && (int) $task['creator_id'] !== $userId
                && !isset($seen[(int) $task['id']]);
        }
        unset($task);

        return $tasks;
    }

    /** @param array<string, mixed> $row */
    public function map(array $row): array
    {
        $dueAt = $row['due_at'] ?? null;
        $status = (string) $row['status'];
        $isOverdue = false;
        $dueLabel = null;
        if ($dueAt) {
            $tz = new \DateTimeZone('Asia/Almaty');
            $due = new \DateTimeImmutable($dueAt, $tz);
            $today = new \DateTimeImmutable('today', $tz);
            $dueDay = $due->setTime(0, 0);
            $isOverdue = $due < new \DateTimeImmutable('now', $tz) && !in_array($status, ['done', 'cancelled'], true);
            if ($dueDay < $today && $isOverdue) {
                $dueLabel = 'Вчера';
                if ($dueDay->format('Y-m-d') !== $today->modify('-1 day')->format('Y-m-d')) {
                    $dueLabel = $due->format('d') . ' ' . self::monthShort((int) $due->format('n'));
                }
            } elseif ($dueDay == $today) {
                $dueLabel = 'Сегодня';
            } else {
                $dueLabel = $due->format('d') . ' ' . self::monthShort((int) $due->format('n'));
            }
        }

        return [
            'id' => (int) $row['id'],
            'number' => $row['number'],
            'title' => $row['title'],
            'description' => $row['description'],
            'status' => $status,
            'priority' => $row['priority'],
            'department_id' => $row['department_id'] !== null && $row['department_id'] !== '' ? (int) $row['department_id'] : null,
            'department_slug' => $row['department_slug'],
            'department_name' => $row['department_name'],
            'department_color' => $row['department_color'],
            'assignee_id' => (int) $row['assignee_id'],
            'assignee_name' => Policy::personName((string) $row['assignee_name'], $row['assignee_deleted_at'] ?? null),
            'assignee_initials' => $row['assignee_initials'],
            'assignee_role' => $row['assignee_role'],
            'creator_id' => (int) $row['creator_id'],
            'creator_name' => isset($row['creator_name']) ? Policy::personName((string) $row['creator_name'], $row['creator_deleted_at'] ?? null) : null,
            'creator_initials' => $row['creator_initials'] ?? null,
            'starts_at' => $row['starts_at'] ?? null,
            'due_at' => $dueAt,
            'due_label' => $dueLabel,
            'completed_at' => $row['completed_at'] ?? null,
            'is_overdue' => $isOverdue,
            'cancel_reason' => $row['cancel_reason'] ?? null,
            'deal_id' => isset($row['deal_id']) ? (int) $row['deal_id'] : null,
            'client_id' => isset($row['client_id']) ? (int) $row['client_id'] : null,
            'template_id' => isset($row['template_id']) ? (int) $row['template_id'] : null,
            'recurrence_id' => isset($row['recurrence_id']) ? (int) $row['recurrence_id'] : null,
            'comments_count' => (int) $row['comments_count'],
            'attachments_count' => (int) $row['attachments_count'],
            'is_urgent' => (int) ($row['is_urgent'] ?? 0) === 1 ? 1 : 0,
            'created_at' => $row['created_at'],
            'recur_on' => $row['recur_on'] ?? null,
            'kpi_key' => $row['kpi_key'] ?? null,
            'requires_file' => (bool) ($row['requires_file'] ?? false),
            'requires_photo' => (bool) ($row['requires_photo'] ?? false),
            'requires_checklist' => (bool) ($row['requires_checklist'] ?? false),
            'submitted_at' => $row['submitted_at'] ?? null,
            // Handed in after the deadline (or still open past it). Stage 2 KPI counts only on-time ones.
            'was_late' => \Trx\Domain\TaskProof::isOverdue($dueAt, $status, $row['submitted_at'] ?? null, $row['completed_at'] ?? null, new \DateTimeImmutable('now', new \DateTimeZone('Asia/Almaty'))),
        ];
    }

    private static function monthShort(int $m): string
    {
        return ['', 'янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][$m] ?? '';
    }
}
