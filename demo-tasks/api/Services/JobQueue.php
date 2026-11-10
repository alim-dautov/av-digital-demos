<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Config;
use Trx\Database;

final class JobQueue
{
    public function enqueue(string $type, array $payload, ?\DateTimeInterface $runAt = null, ?int $maxAttempts = null): int
    {
        $run = $runAt ? $runAt->format('Y-m-d H:i:s') : date('Y-m-d H:i:s');
        $max = $maxAttempts ?? (int) Config::get('jobs.max_attempts', 5);
        $stmt = Database::pdo()->prepare(
            'INSERT INTO jobs (type, payload, run_at, max_attempts) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([$type, json_encode($payload, JSON_UNESCAPED_UNICODE), $run, $max]);

        return (int) Database::pdo()->lastInsertId();
    }

    /**
     * Claims up to $limit runnable jobs for $workerId. Portable to MariaDB 10.4 (no `SKIP LOCKED`, which needs
     * MariaDB 10.6 / MySQL 8.0.1): candidates come from a plain non-locking read, then each one is taken with its
     * own autocommitted conditional UPDATE (`... WHERE id = ? AND status = 'pending'`). InnoDB applies that UPDATE
     * to the latest committed row under the row lock, so of two workers racing for one job exactly one gets
     * affected-rows 1; the other gets 0 and simply skips it. Row locks are held for one single-row statement only
     * (no batch transaction, no gap locks over the poll index), so workers neither wait long nor deadlock.
     * Runs outside any caller transaction: inside one the claims would stay invisible and locked until its commit.
     *
     * @return list<array<string, mixed>>
     */
    public function claimBatch(string $workerId, ?int $limit = null): array
    {
        $limit = max(1, $limit ?? (int) Config::get('jobs.batch_size', 20));
        $pdo = Database::pdo();
        if ($pdo->inTransaction()) {
            throw new \LogicException('JobQueue::claimBatch must not run inside a caller transaction');
        }
        $select = $pdo->prepare(
            "SELECT id FROM jobs
             WHERE status = 'pending' AND run_at <= NOW() AND id > ?
             ORDER BY id ASC
             LIMIT ?"
        );
        $claim = $pdo->prepare(
            "UPDATE jobs SET status = 'processing', locked_at = NOW(), locked_by = ?, attempts = attempts + 1
             WHERE id = ? AND status = 'pending' AND run_at <= NOW()"
        );
        $won = [];
        $after = 0;
        // A job lost to a parallel worker frees a slot: keep reading further candidates (id cursor, so each row
        // is tried at most once per call) until the batch is full or nothing runnable is left.
        while (count($won) < $limit) {
            $select->bindValue(1, $after, PDO::PARAM_INT);
            $select->bindValue(2, $limit - count($won), PDO::PARAM_INT);
            $select->execute();
            $candidates = $select->fetchAll(PDO::FETCH_COLUMN);
            if (!$candidates) {
                break;
            }
            foreach ($candidates as $id) {
                $after = (int) $id;
                $claim->execute([$workerId, $after]);
                if ($claim->rowCount() === 1) {
                    $won[] = $after;
                }
            }
        }
        if (!$won) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($won), '?'));
        $fetch = $pdo->prepare(
            "SELECT * FROM jobs WHERE id IN ({$placeholders}) AND status = 'processing' AND locked_by = ? ORDER BY id ASC"
        );
        $fetch->execute(array_merge($won, [$workerId]));

        return $fetch->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function markDone(int $id): void
    {
        Database::pdo()->prepare(
            "UPDATE jobs SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL WHERE id = ?"
        )->execute([$id]);
    }

    public function markFailed(int $id, string $error, int $attempts, int $maxAttempts): void
    {
        if ($attempts >= $maxAttempts) {
            Database::pdo()->prepare(
                "UPDATE jobs SET status = 'failed', last_error = ?, locked_at = NULL, locked_by = NULL WHERE id = ?"
            )->execute([mb_substr($error, 0, 2000), $id]);

            return;
        }
        $delayMinutes = min(60, (int) pow(2, $attempts));
        Database::pdo()->prepare(
            "UPDATE jobs SET status = 'pending', last_error = ?, locked_at = NULL, locked_by = NULL,
             run_at = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?"
        )->execute([mb_substr($error, 0, 2000), $delayMinutes, $id]);
    }

    /** Ack only if the claim is still ours (used for fenced job types; other types keep markDone/markFailed). */
    public function markDoneIfOwned(int $id, string $workerId): bool
    {
        $st = Database::pdo()->prepare(
            "UPDATE jobs SET status = 'done', locked_at = NULL, locked_by = NULL, last_error = NULL
             WHERE id = ? AND status = 'processing' AND locked_by = ?"
        );
        $st->execute([$id, $workerId]);

        return $st->rowCount() === 1;
    }

    /** Failure ack only if the claim is still ours; never retried here (fenced types are rescheduled by the Scheduler). */
    public function markFailedIfOwned(int $id, string $workerId, string $error): bool
    {
        $st = Database::pdo()->prepare(
            "UPDATE jobs SET status = 'failed', last_error = ?, locked_at = NULL, locked_by = NULL
             WHERE id = ? AND status = 'processing' AND locked_by = ?"
        );
        $st->execute([mb_substr($error, 0, 2000), $id, $workerId]);

        return $st->rowCount() === 1;
    }
}
