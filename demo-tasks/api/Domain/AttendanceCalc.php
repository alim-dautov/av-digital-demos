<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Worked hours per working day. Lunch: 1 hour, once per fully closed day, never below zero.
 * A day with any open or incomplete shift is «не рассчитано» (worked_seconds = null): no lunch, no invented leave time.
 */
final class AttendanceCalc
{
    public const LUNCH_SECONDS = 3600;

    /**
     * @param list<array{in_at_utc:string,out_at_utc:?string,status:string}> $shifts
     * @return array{status:'complete'|'incomplete',raw_seconds:int,lunch_seconds:int,worked_seconds:?int}
     */
    public static function day(array $shifts): array
    {
        $raw = 0;
        $complete = $shifts !== [];
        foreach ($shifts as $s) {
            if (($s['status'] ?? '') !== 'closed' || empty($s['out_at_utc'])) {
                $complete = false;
                continue;
            }
            $raw += max(0, AttendanceClock::unix((string) $s['out_at_utc']) - AttendanceClock::unix((string) $s['in_at_utc']));
        }
        if (!$complete) {
            return ['status' => 'incomplete', 'raw_seconds' => $raw, 'lunch_seconds' => 0, 'worked_seconds' => null];
        }
        $lunch = min(self::LUNCH_SECONDS, $raw);

        return ['status' => 'complete', 'raw_seconds' => $raw, 'lunch_seconds' => $lunch, 'worked_seconds' => $raw - $lunch];
    }

    /**
     * @param list<array<string, mixed>> $shifts
     * @return array<string, list<array<string, mixed>>>
     */
    public static function groupByDay(array $shifts): array
    {
        $out = [];
        foreach ($shifts as $s) {
            $out[(string) $s['work_date']][] = $s;
        }
        ksort($out);

        return $out;
    }
}
