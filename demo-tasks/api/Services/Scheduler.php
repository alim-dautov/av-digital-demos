<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;

/**
 * Puts periodic jobs into the queue from the per-minute cron.
 * A MySQL named lock keeps two overlapping cron runs from double-queueing.
 */
final class Scheduler
{
    /** @var array<string, int> job type => interval in minutes */
    private const SCHEDULE = [
        'deadline_reminder' => 5,
        'task_recurrence' => 1,
        'sla_check' => 5,
        'timesheet_archive' => 15,
    ];

    public function __construct(private readonly JobQueue $jobs = new JobQueue())
    {
    }

    /** @return list<string> queued job types */
    public function tick(): array
    {
        $pdo = Database::pdo();
        if ((int) $pdo->query("SELECT GET_LOCK('demo_scheduler', 0)")->fetchColumn() !== 1) {
            return [];
        }
        $queued = [];
        try {
            // Archive-only lease: close a dead worker's stuck `timesheet_archive` job (see TimesheetArchiveService).
            (new TimesheetArchiveService())->reclaimAbandonedJob();
            $check = $pdo->prepare(
                "SELECT 1 FROM jobs WHERE type = ?
                 AND (status IN ('pending','processing') OR created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE))
                 LIMIT 1"
            );
            foreach (self::SCHEDULE as $type => $minutes) {
                $check->execute([$type, $minutes]);
                if ($check->fetchColumn()) {
                    continue;
                }
                $this->jobs->enqueue($type, [], null, 1);
                $queued[] = $type;
            }
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('demo_scheduler')");
        }

        return $queued;
    }
}
