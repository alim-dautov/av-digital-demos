<?php

declare(strict_types=1);

namespace Trx\Services;

final class JobRunner
{
    public function __construct(
        private readonly JobQueue $queue = new JobQueue(),
        private readonly PushService $push = new PushService(),
        private readonly ?\Closure $archive = null,
    ) {
    }

    public function run(string $workerId): int
    {
        $jobs = $this->queue->claimBatch($workerId);
        foreach ($jobs as $job) {
            $this->process($job, $workerId);
        }

        return count($jobs);
    }

    /** Executes one claimed job. `timesheet_archive` is fenced: ownership rechecked under its lock, ack conditional. */
    public function process(array $job, string $workerId): void
    {
        if ((string) $job['type'] === 'timesheet_archive') {
            $archive = $this->archive !== null ? ($this->archive)() : new TimesheetArchiveService();
            try {
                $ran = $archive->runClaimed((int) $job['id'], $workerId, $job['locked_at'] === null ? null : (string) $job['locked_at'], new \DateTimeImmutable('now'));
                if ($ran !== false) {
                    $this->queue->markDoneIfOwned((int) $job['id'], $workerId);
                }
            } catch (\Throwable $e) {
                $this->queue->markFailedIfOwned((int) $job['id'], $workerId, $e->getMessage());
            }

            return;
        }
        try {
            $this->handle($job);
            $this->queue->markDone((int) $job['id']);
        } catch (\Throwable $e) {
            $this->queue->markFailed(
                (int) $job['id'],
                $e->getMessage(),
                (int) $job['attempts'],
                (int) $job['max_attempts']
            );
        }
    }

    /** @param array<string, mixed> $job */
    private function handle(array $job): void
    {
        $type = (string) $job['type'];
        $payload = is_string($job['payload'])
            ? (json_decode($job['payload'], true) ?: [])
            : (array) $job['payload'];

        match ($type) {
            'ping' => null,
            'web_push' => $this->sendPush($payload),
            'deadline_reminder' => (new TaskService())->remindDue(),
            'task_recurrence' => (new TaskRecurrenceService())->runDue(),
            'sla_check' => (new CrmService())->flagOverdueSla(),
            'timesheet_archive' => throw new \LogicException('timesheet_archive is executed via process() fencing'),
            default => throw new \RuntimeException("Unknown job type: {$type}"),
        };
    }

    /** @param array<string, mixed> $payload */
    private function sendPush(array $payload): void
    {
        $result = $this->push->sendToUser(
            (int) ($payload['user_id'] ?? 0),
            (string) ($payload['title'] ?? 'Demo CRM'),
            (string) ($payload['body'] ?? ''),
            (string) ($payload['url'] ?? '/'),
            [
                'requireInteraction' => !empty($payload['requireInteraction']),
                'tag' => (string) ($payload['tag'] ?? ''),
            ]
        );
        if ($result['sent'] === 0 && $result['failed'] > 0) {
            throw new \RuntimeException('Web Push failed: ' . implode('; ', $result['errors']));
        }
    }
}
