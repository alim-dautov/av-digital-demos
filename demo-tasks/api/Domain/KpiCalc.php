<?php

declare(strict_types=1);

namespace Trx\Domain;

/** Pure KPI bonus rules (stage 2). */
final class KpiCalc
{
    /** Bonus for one indicator: max × done / planned, rounded to whole tenge. */
    public static function bonus(int $max, int $planned, int $done): int
    {
        if ($planned <= 0 || $max <= 0) {
            return 0;
        }
        $done = max(0, min($done, $planned));

        return (int) round($max * $done / $planned, 0, PHP_ROUND_HALF_UP);
    }

    public static function percent(int $planned, int $done): ?float
    {
        return $planned > 0 ? round(100 * min($done, $planned) / $planned, 1) : null;
    }

    /**
     * On time = handed in (sent to review, or closed directly) not later than the deadline.
     * A task without a deadline counts as on time once handed in.
     */
    public static function onTime(?string $dueAt, ?string $submittedAt, ?string $completedAt): bool
    {
        $handed = $submittedAt ?: $completedAt;
        if (!$handed) {
            return false;
        }

        return !$dueAt || strtotime($handed) <= strtotime($dueAt);
    }

    /** Final bonus: calculated + manual adjustment, never below 0 and never above the cap. */
    public static function total(int $calculated, int $adjustment, int $cap): int
    {
        return max(0, min($cap, $calculated + $adjustment));
    }

    public static function period(mixed $value): ?string
    {
        $v = is_string($value) ? trim($value) : '';
        if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $v)) {
            return null;
        }

        return $v;
    }
}
