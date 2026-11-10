<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\RecurrenceSchedule;
use Trx\Security\Policy;

final class TaskRecurrenceService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
        private readonly TaskTemplateService $templates = new TaskTemplateService(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @return list<array<string, mixed>>
     */
    public function list(array $user): array
    {
        $this->need($user, 'view');
        $rows = Database::pdo()->query(
            'SELECT r.*, t.title AS template_title, u.name AS assignee_name
             FROM task_recurrences r
             JOIN task_templates t ON t.id = r.template_id
             JOIN users u ON u.id = r.assignee_id
             WHERE t.is_active = 1 ORDER BY r.is_active DESC, r.next_run_at'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];

        return $this->attachAssignees($rows);
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function save(array $user, ?int $id, array $input): array
    {
        $this->need($user, 'update');
        $templateId = (int) ($input['template_id'] ?? 0);
        $this->templates->find($templateId);
        $assigneeIds = $this->assigneeIdsFromInput($input);
        $assignee = $assigneeIds[0];
        $rule = (string) ($input['rule'] ?? 'daily');
        if (!in_array($rule, ['daily', 'weekly', 'monthly'], true)) {
            throw new AppException('Неизвестное правило повтора');
        }
        $weekdays = array_values(array_unique(array_filter(
            array_map('intval', (array) ($input['weekdays'] ?? [])),
            static fn (int $d) => $d >= 1 && $d <= 7
        )));
        sort($weekdays);
        if ($rule === 'weekly' && $weekdays === []) {
            throw new AppException('Выберите дни недели');
        }
        $monthDay = $rule === 'monthly' ? max(1, min(31, (int) ($input['month_day'] ?? 1))) : null;
        $runTime = (string) ($input['run_time'] ?? '09:00');
        if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', substr($runTime, 0, 5))) {
            throw new AppException('Время в формате ЧЧ:ММ');
        }
        $runTime = substr($runTime, 0, 5) . ':00';
        $dueTime = trim((string) ($input['due_time'] ?? ''));
        if ($dueTime !== '' && !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', substr($dueTime, 0, 5))) {
            throw new AppException('Срок — время в формате ЧЧ:ММ');
        }
        $dueTime = $dueTime === '' ? null : substr($dueTime, 0, 5) . ':00';
        $skip = !empty($input['skip_non_working']) ? 1 : 0;
        $active = !array_key_exists('is_active', $input) || !empty($input['is_active']);
        $next = RecurrenceSchedule::next($rule, $weekdays, $monthDay, $runTime, $this->now());

        $values = [$templateId, $assignee, $rule, $weekdays === [] ? null : implode(',', $weekdays), $monthDay, $runTime, $active ? 1 : 0, $next->format('Y-m-d H:i:s'), $dueTime, $skip];
        $pdo = Database::pdo();
        if ($id === null) {
            $pdo->prepare(
                'INSERT INTO task_recurrences (template_id, assignee_id, rule, weekdays, month_day, run_time, is_active, next_run_at, due_time, skip_non_working, creator_id)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([...$values, (int) $user['user_id']]);
            $id = (int) $pdo->lastInsertId();
        } else {
            $this->row($id);
            $pdo->prepare(
                'UPDATE task_recurrences SET template_id = ?, assignee_id = ?, rule = ?, weekdays = ?, month_day = ?, run_time = ?, is_active = ?, next_run_at = ?, due_time = ?, skip_non_working = ? WHERE id = ?'
            )->execute([...$values, $id]);
        }
        $this->replaceAssigneeRows($id, $assigneeIds);
        $this->audit->log((int) $user['user_id'], 'task_recurrence', (string) $id, 'save', null, ['rule' => $rule, 'due_time' => $dueTime, 'skip_non_working' => $skip, 'template_id' => $templateId, 'assignee_ids' => $assigneeIds]);

        return $this->attachAssignees([$this->row($id)])[0];
    }

    /** @param array<string, mixed> $user */
    public function delete(array $user, int $id): void
    {
        $this->need($user, 'update');
        $this->row($id);
        Database::pdo()->prepare('DELETE FROM task_recurrences WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'task_recurrence', (string) $id, 'delete', null, null);
    }

    /**
     * Creates tasks for due recurrences. The (recurrence_id, recur_on) unique key keeps it idempotent
     * when two workers overlap or a run is retried.
     */
    public function runDue(): int
    {
        $pdo = Database::pdo();
        // Cron and the on-request fallback may both call this; one runner at a time.
        if ((int) $pdo->query("SELECT GET_LOCK('demo_recurrence', 0)")->fetchColumn() !== 1) {
            return 0;
        }
        try {
            $created = $this->runDueLocked($pdo);
            try {
                (new KpiAlerts())->scanOverdue();
            } catch (\Throwable $e) {
                error_log('DEMO kpi alerts: ' . $e->getMessage());
            }

            return $created;
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('demo_recurrence')");
        }
    }

    private function runDueLocked(PDO $pdo): int
    {
        $due = $pdo->query(
            'SELECT r.*, t.is_active AS template_active FROM task_recurrences r
             JOIN task_templates t ON t.id = r.template_id
             WHERE r.is_active = 1 AND r.next_run_at <= NOW()'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $created = 0;
        $tasks = new TaskService();
        $calendars = new WorkCalendarService();
        foreach ($due as $row) {
            $occurrence = new \DateTimeImmutable((string) $row['next_run_at'], new \DateTimeZone('Asia/Almaty'));
            $day = $occurrence->format('Y-m-d');
            $weekdays = $row['weekdays'] ? array_map('intval', explode(',', (string) $row['weekdays'])) : [];
            $next = RecurrenceSchedule::next(
                (string) $row['rule'],
                $weekdays,
                $row['month_day'] !== null ? (int) $row['month_day'] : null,
                (string) $row['run_time'],
                max($occurrence, $this->now())
            );
            $pdo->prepare('UPDATE task_recurrences SET next_run_at = ?, last_run_at = NOW() WHERE id = ?')
                ->execute([$next->format('Y-m-d H:i:s'), (int) $row['id']]);
            if ((int) $row['template_active'] !== 1) {
                continue;
            }
            $creator = $this->actor((int) $row['creator_id']);
            if ($creator === null) {
                continue;
            }
            $calendar = $calendars->calendar($day, $day);
            if (!empty($row['skip_non_working']) && !$calendar->isWorkingDay($day)) {
                $this->audit->log(null, 'task_recurrence', (string) $row['id'], 'skip', null, ['day' => $day, 'reason' => 'non_working_day']);
                continue;
            }
            $assignees = $calendar->present($this->storedAssigneeIds((int) $row['id'], (int) $row['assignee_id']), $day);
            if ($assignees === []) {
                $this->audit->log(null, 'task_recurrence', (string) $row['id'], 'skip', null, ['day' => $day, 'reason' => 'vacation']);
                continue;
            }
            $input = [
                'template_id' => (int) $row['template_id'],
                'assignee_ids' => $assignees,
                'recurrence_id' => (int) $row['id'],
                'recur_on' => $day,
            ];
            if (!empty($row['due_time'])) {
                $dueAt = new \DateTimeImmutable($day . ' ' . $row['due_time'], new \DateTimeZone('Asia/Almaty'));
                $input['due_at'] = ($dueAt <= $occurrence ? $dueAt->modify('+1 day') : $dueAt)->format('Y-m-d H:i:s');
            }
            try {
                $tasks->create($creator, $input);
                $created++;
            } catch (\PDOException $e) {
                if ($e->getCode() !== '23000') {
                    throw $e;
                }
            }
        }

        return $created;
    }

    /** @return array<string, mixed>|null */
    private function actor(int $userId): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT u.id AS user_id, u.name, u.department_id, r.slug AS role_slug
             FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND u.is_active = 1'
        );
        $stmt->execute([$userId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row ? \Trx\Security\Policy::normalizeRole($row) : null;
    }

    /** @return array<string, mixed> */
    private function row(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT r.*, t.title AS template_title, u.name AS assignee_name
             FROM task_recurrences r JOIN task_templates t ON t.id = r.template_id JOIN users u ON u.id = r.assignee_id
             WHERE r.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Повтор не найден', 404);
        }

        return $row;
    }

    /** @param array<string, mixed> $row */
    private function map(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'template_id' => (int) $row['template_id'],
            'template_title' => $row['template_title'],
            'assignee_id' => (int) $row['assignee_id'],
            'assignee_name' => $row['assignee_name'],
            'assignees' => $row['assignees'] ?? [['id' => (int) $row['assignee_id'], 'name' => (string) $row['assignee_name']]],
            'rule' => $row['rule'],
            'weekdays' => $row['weekdays'] ? array_map('intval', explode(',', (string) $row['weekdays'])) : [],
            'month_day' => $row['month_day'] !== null ? (int) $row['month_day'] : null,
            'run_time' => substr((string) $row['run_time'], 0, 5),
            'is_active' => (bool) $row['is_active'],
            'due_time' => !empty($row['due_time']) ? substr((string) $row['due_time'], 0, 5) : null,
            'skip_non_working' => (bool) ($row['skip_non_working'] ?? false),
            'next_run_at' => $row['next_run_at'],
            'last_run_at' => $row['last_run_at'],
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function attachAssignees(array $rows): array
    {
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn (array $row): int => (int) $row['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = Database::pdo()->prepare(
            "SELECT ra.recurrence_id, ra.position, u.id, u.name
             FROM task_recurrence_assignees ra
             JOIN users u ON u.id = ra.user_id
             WHERE ra.recurrence_id IN ($placeholders)
             ORDER BY ra.recurrence_id, ra.position, u.name"
        );
        $stmt->execute($ids);
        $grouped = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $person) {
            $grouped[(int) $person['recurrence_id']][] = [
                'id' => (int) $person['id'],
                'name' => (string) $person['name'],
            ];
        }
        $out = [];
        foreach ($rows as $row) {
            $people = $grouped[(int) $row['id']] ?? [];
            if ($people === []) {
                $people = [['id' => (int) $row['assignee_id'], 'name' => (string) $row['assignee_name']]];
            }
            $row['assignees'] = $people;
            $row['assignee_id'] = $people[0]['id'];
            $row['assignee_name'] = implode(', ', array_column($people, 'name'));
            $out[] = $this->map($row);
        }

        return $out;
    }

    /**
     * @param array<string, mixed> $input
     * @return list<int>
     */
    private function assigneeIdsFromInput(array $input): array
    {
        if (array_key_exists('assignee_ids', $input)) {
            if (!is_array($input['assignee_ids'])) {
                throw new AppException('Укажите ответственных');
            }
            $raw = $input['assignee_ids'];
        } elseif (array_key_exists('assignee_id', $input)) {
            $raw = [$input['assignee_id']];
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
            throw new AppException('Укажите ответственного');
        }
        $stmt = Database::pdo()->prepare('SELECT 1 FROM users WHERE id = ? AND is_active = 1');
        foreach ($ids as $id) {
            $stmt->execute([$id]);
            if (!$stmt->fetchColumn()) {
                throw new AppException('Укажите ответственного');
            }
        }

        return $ids;
    }

    /** @param list<int> $ids */
    private function replaceAssigneeRows(int $recurrenceId, array $ids): void
    {
        $pdo = Database::pdo();
        $pdo->prepare('DELETE FROM task_recurrence_assignees WHERE recurrence_id = ?')->execute([$recurrenceId]);
        $stmt = $pdo->prepare('INSERT INTO task_recurrence_assignees (recurrence_id, user_id, position) VALUES (?,?,?)');
        foreach (array_values($ids) as $position => $userId) {
            $stmt->execute([$recurrenceId, $userId, $position]);
        }
    }

    /** @return list<int> */
    private function storedAssigneeIds(int $recurrenceId, int $fallback): array
    {
        $stmt = Database::pdo()->prepare('SELECT user_id FROM task_recurrence_assignees WHERE recurrence_id = ? ORDER BY position, user_id');
        $stmt->execute([$recurrenceId]);
        $ids = [];
        foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) ?: [] as $id) {
            $id = (int) $id;
            if ($id > 0 && !in_array($id, $ids, true)) {
                $ids[] = $id;
            }
        }

        return $ids !== [] ? $ids : ($fallback > 0 ? [$fallback] : []);
    }

    private function now(): \DateTimeImmutable
    {
        return new \DateTimeImmutable('now', new \DateTimeZone('Asia/Almaty'));
    }

    /** @param array<string, mixed> $user */
    private function need(array $user, string $action): void
    {
        if (!$this->policy->can($user, 'tasks', $action)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }
}
