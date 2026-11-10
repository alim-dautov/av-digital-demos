<?php

declare(strict_types=1);

namespace Trx\Services;

use DateTimeImmutable;
use PDO;
use Trx\Database;
use Trx\Domain\TaskAnalytics;
use Trx\Security\Policy;

/**
 * «Аналитика» (по задачам) and the «Команда» profiles.
 * Period filter applies to task creation date (created_at). Superadmin is excluded everywhere.
 */
final class AnalyticsService
{
    /** @param array<string, mixed> $query @return array<string, mixed> */
    public function tasks(array $query): array
    {
        [$from, $to] = $this->range($query);
        $users = $this->users();
        $tasks = $this->taskRows('t.created_at >= ? AND t.created_at < ?', [$from . ' 00:00:00', $this->nextDay($to)]);
        $rows = TaskAnalytics::perUser($users, $tasks, time());

        return ['from' => $from, 'to' => $to, 'items' => $rows, 'ranking' => TaskAnalytics::ranking($rows)];
    }

    /** @return array<string, mixed> */
    public function team(): array
    {
        $users = $this->users();
        $stats = [];
        foreach (TaskAnalytics::perUser($users, $this->taskRows('1=1', []), time()) as $s) {
            $stats[$s['user_id']] = $s;
        }
        $people = [];
        foreach ($users as $u) {
            $people[] = $u + ['stats' => $stats[(int) $u['id']] ?? null];
        }

        return ['people' => $people];
    }

    /** @return array<string, mixed> */
    public function profile(int $id): array
    {
        $user = null;
        foreach ($this->users() as $u) {
            if ((int) $u['id'] === $id) {
                $user = $u;
            }
        }
        if ($user === null) {
            throw new AppException('Сотрудник не найден', 404);
        }
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.number, t.title, t.status, t.priority, t.due_at, t.created_at, t.completed_at
             FROM tasks t
             WHERE t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = ?)
             ORDER BY t.id DESC LIMIT 500'
        );
        $stmt->execute([$id, $id]);
        $groups = ['new' => [], 'in_progress' => [], 'on_review' => [], 'done' => [], 'cancelled' => []];
        $now = time();
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $t) {
            $t['id'] = (int) $t['id'];
            $t['overdue'] = in_array($t['status'], TaskAnalytics::OPEN, true) && $t['due_at'] !== null && strtotime((string) $t['due_at']) < $now;
            $groups[(string) $t['status']][] = $t;
        }
        $stats = TaskAnalytics::perUser([$user], $this->taskRows('(t.assignee_id = ? OR EXISTS (SELECT 1 FROM task_assignees ta2 WHERE ta2.task_id = t.id AND ta2.user_id = ?))', [$id, $id]), $now)[0];

        return ['user' => $user, 'stats' => $stats, 'groups' => $groups];
    }

    /** @return list<array<string, mixed>> */
    private function users(): array
    {
        $rows = Database::pdo()->query(
            'SELECT u.id, u.name, u.initials, u.email, u.phone, u.last_login_at, r.name role_name, d.name dept_name, d.color
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.is_active = 1 AND u.deleted_at IS NULL AND ' . Policy::hideSuperadminSql('u') . '
             ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        foreach ($rows as &$r) {
            $r['id'] = (int) $r['id'];
        }

        return $rows;
    }

    /** @param list<mixed> $params @return list<array<string, mixed>> */
    private function taskRows(string $where, array $params): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT t.id, t.status, t.created_at, t.completed_at, t.due_at, t.assignee_id,
                    (SELECT GROUP_CONCAT(ta.user_id) FROM task_assignees ta WHERE ta.task_id = t.id) extra
             FROM tasks t WHERE ' . $where
        );
        $stmt->execute($params);
        $out = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $r) {
            $ids = [(int) $r['assignee_id']];
            foreach (explode(',', (string) $r['extra']) as $x) {
                if ($x !== '') {
                    $ids[] = (int) $x;
                }
            }
            $out[] = [
                'status' => (string) $r['status'],
                'created_at' => (string) $r['created_at'],
                'completed_at' => $r['completed_at'],
                'due_at' => $r['due_at'],
                'user_ids' => $ids,
            ];
        }

        return $out;
    }

    /** @param array<string, mixed> $q @return array{0:string,1:string} */
    private function range(array $q): array
    {
        $today = new DateTimeImmutable('today');
        $period = (string) ($q['period'] ?? 'month');
        if ($period === 'week') {
            return [$today->modify('-6 days')->format('Y-m-d'), $today->format('Y-m-d')];
        }
        if ($period === 'custom') {
            $from = $this->date($q['from'] ?? null);
            $to = $this->date($q['to'] ?? null);
            if ($from === null || $to === null || $from > $to) {
                throw new AppException('Укажите корректный период: дата «с» не позже даты «по»', 422);
            }

            return [$from, $to];
        }

        return [$today->modify('-29 days')->format('Y-m-d'), $today->format('Y-m-d')];
    }

    private function date(mixed $v): ?string
    {
        if (!is_string($v)) {
            return null;
        }
        $d = DateTimeImmutable::createFromFormat('!Y-m-d', $v);

        return $d && $d->format('Y-m-d') === $v ? $v : null;
    }

    private function nextDay(string $day): string
    {
        return (new DateTimeImmutable($day))->modify('+1 day')->format('Y-m-d 00:00:00');
    }
}
