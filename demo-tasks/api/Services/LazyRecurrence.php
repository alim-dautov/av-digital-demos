<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Config;

/**
 * Fallback when hosting cron is not running: API requests (including login) create due regular tasks
 * at most once per interval. Idempotent with cron thanks to the lock in runDue and the unique (recurrence_id, recur_on).
 */
final class LazyRecurrence
{
    public const INTERVAL_SECONDS = 300;

    public static function due(?int $lastRun, int $now): bool
    {
        return $lastRun === null || $now - $lastRun >= self::INTERVAL_SECONDS;
    }

    public static function maybeRun(): void
    {
        $stamp = rtrim((string) Config::get('paths.storage', dirname(__DIR__, 2) . '/storage'), '/') . '/cache/recurrence.stamp';
        $last = is_file($stamp) ? (int) @file_get_contents($stamp) : null;
        if (!self::due($last ?: null, time())) {
            return;
        }
        if (!is_dir(dirname($stamp))) {
            @mkdir(dirname($stamp), 0775, true);
        }
        @file_put_contents($stamp, (string) time());
        try {
            (new TaskRecurrenceService())->runDue();
        } catch (\Throwable $e) {
            error_log('DEMO lazy recurrence: ' . $e->getMessage());
        }
    }
}
