<?php

declare(strict_types=1);

namespace Trx\Domain;

/** KPI plan/fact. Percent = fact / plan * 100, one decimal. No plan (<= 0) → null («нет плана»). */
final class KpiPlan
{
    public static function percent(float $plan, float $fact): ?float
    {
        if ($plan <= 0) {
            return null;
        }

        return round($fact / $plan * 100, 1);
    }

    /** "YYYY-MM" or null when invalid. */
    public static function period(mixed $value, ?string $default = null): ?string
    {
        if ($value === null || $value === '') {
            return $default;
        }
        if (!is_string($value) || !preg_match('/^(\d{4})-(0[1-9]|1[0-2])$/', $value)) {
            return null;
        }

        return $value;
    }
}
