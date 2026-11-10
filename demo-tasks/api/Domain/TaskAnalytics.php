<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Task statistics per employee.
 * - total: tasks of the employee, cancelled ones are not counted;
 * - done: status done;
 * - in_progress: new, in_progress, on_review (everything still open);
 * - overdue: open tasks whose due_at is already in the past;
 * - avg_hours: average time from created_at to completed_at over done tasks.
 * A task with several responsible employees counts for each of them.
 */
final class TaskAnalytics
{
    public const OPEN = ['new', 'in_progress', 'on_review'];

    /**
     * @param list<array{id:int, name:string}> $users
     * @param list<array{status:string, created_at:string, completed_at:?string, due_at:?string, user_ids:list<int>}> $tasks
     * @return list<array{user_id:int, name:string, total:int, done:int, in_progress:int, overdue:int, avg_hours:?float}>
     */
    public static function perUser(array $users, array $tasks, int $now): array
    {
        $stats = [];
        foreach ($users as $user) {
            $stats[(int) $user['id']] = [
                'user_id' => (int) $user['id'],
                'name' => (string) $user['name'],
                'total' => 0,
                'done' => 0,
                'in_progress' => 0,
                'overdue' => 0,
                'avg_hours' => null,
                '_sum' => 0,
                '_n' => 0,
            ];
        }
        foreach ($tasks as $task) {
            $status = (string) $task['status'];
            if ($status === 'cancelled') {
                continue;
            }
            foreach (array_unique(array_map('intval', $task['user_ids'])) as $uid) {
                if (!isset($stats[$uid])) {
                    continue;
                }
                $row = &$stats[$uid];
                $row['total']++;
                if ($status === 'done') {
                    $row['done']++;
                    $start = strtotime((string) $task['created_at']);
                    $end = $task['completed_at'] ? strtotime((string) $task['completed_at']) : false;
                    if ($start !== false && $end !== false && $end >= $start) {
                        $row['_sum'] += $end - $start;
                        $row['_n']++;
                    }
                } elseif (in_array($status, self::OPEN, true)) {
                    $row['in_progress']++;
                    $due = $task['due_at'] ? strtotime((string) $task['due_at']) : false;
                    if ($due !== false && $due < $now) {
                        $row['overdue']++;
                    }
                }
                unset($row);
            }
        }
        $out = [];
        foreach ($stats as $row) {
            $row['avg_hours'] = $row['_n'] > 0 ? round($row['_sum'] / $row['_n'] / 3600, 1) : null;
            unset($row['_sum'], $row['_n']);
            $out[] = $row;
        }

        return $out;
    }

    /**
     * Speed ranking: fastest average first; employees without done tasks go last.
     *
     * @param list<array{avg_hours:?float, done:int, name:string}> $rows
     * @return list<array<string, mixed>>
     */
    public static function ranking(array $rows): array
    {
        usort($rows, static function (array $a, array $b): int {
            if ($a['avg_hours'] === null || $b['avg_hours'] === null) {
                return ($a['avg_hours'] === null) <=> ($b['avg_hours'] === null) ?: $b['done'] <=> $a['done'];
            }

            return $a['avg_hours'] <=> $b['avg_hours'] ?: $b['done'] <=> $a['done'];
        });

        return $rows;
    }
}
