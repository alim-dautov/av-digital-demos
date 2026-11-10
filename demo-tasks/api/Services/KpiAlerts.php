<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;

/**
 * KPI stage 2 notifications — only two kinds, deduplicated, to the owner(s) and the responsible manager (task creator):
 *  - a regular (recurring) task is overdue;
 *  - an employee tried to hand in a task without the required proof.
 */
final class KpiAlerts
{
    public function __construct(private readonly NotificationService $notifications = new NotificationService())
    {
    }

    /** @return list<int> */
    public static function ownerIds(): array
    {
        $ids = Database::pdo()->query(
            "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
             WHERE r.slug = 'owner' AND u.is_active = 1 AND u.deleted_at IS NULL"
        )->fetchAll(PDO::FETCH_COLUMN) ?: [];

        return array_map('intval', $ids);
    }

    /** @return list<int> */
    private function recipients(int $creatorId): array
    {
        return array_values(array_unique(array_filter([...self::ownerIds(), $creatorId], static fn (int $id) => $id > 0)));
    }

    public function scanOverdue(): int
    {
        $rows = Database::pdo()->query(
            "SELECT t.id, t.title, t.creator_id, t.due_at, u.name AS assignee_name
             FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
             WHERE t.recurrence_id IS NOT NULL AND t.status NOT IN ('on_review','done','cancelled')
               AND t.due_at IS NOT NULL AND t.due_at < NOW() AND t.due_at >= NOW() - INTERVAL 7 DAY"
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $sent = 0;
        foreach ($rows as $row) {
            $body = $row['title'] . ($row['assignee_name'] ? ' — ' . $row['assignee_name'] : '') . ', срок ' . date('d.m H:i', (int) strtotime((string) $row['due_at']));
            foreach ($this->recipients((int) $row['creator_id']) as $userId) {
                if ($this->notifications->notify($userId, 'kpi_overdue', 'KPI: регулярная задача просрочена', $body, '/tasks?task=' . $row['id'], 'kpi-overdue-' . $row['id'] . '-' . $userId)) {
                    $sent++;
                }
            }
        }

        return $sent;
    }

    /** @param array<string, mixed> $task @param list<string> $missing */
    public function proofMissing(int $taskId, array $task, int $actorId, array $missing): void
    {
        try {
            $name = (string) (Database::pdo()->query('SELECT name FROM users WHERE id = ' . (int) $actorId)->fetchColumn() ?: '');
            $what = implode(', ', $missing);
            $body = $task['title'] . ($name !== '' ? ' — ' . $name : '') . '. Не хватает: ' . $what;
            foreach ($this->recipients((int) ($task['creator_id'] ?? 0)) as $userId) {
                if ($userId === $actorId) {
                    continue;
                }
                $this->notifications->notify($userId, 'kpi_no_proof', 'KPI: сдача без подтверждения', $body, '/tasks?task=' . $taskId, 'kpi-noproof-' . $taskId . '-' . date('Y-m-d') . '-' . $userId);
            }
        } catch (\Throwable $e) {
            error_log('DEMO kpi proof alert: ' . $e->getMessage());
        }
    }
}
