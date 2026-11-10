<?php

declare(strict_types=1);

namespace Trx\Domain;

final class RecurrenceSchedule
{
    /**
     * Next run strictly after $after.
     *
     * @param list<int> $weekdays ISO-8601 days, 1 = Monday
     */
    public static function next(string $rule, array $weekdays, ?int $monthDay, string $runTime, \DateTimeImmutable $after): \DateTimeImmutable
    {
        [$h, $m] = array_map('intval', explode(':', $runTime) + [0, 0]);
        $candidate = $after->setTime($h, $m);
        if ($candidate <= $after) {
            $candidate = $candidate->modify('+1 day');
        }

        return match ($rule) {
            'daily' => $candidate,
            'weekly' => self::nextWeekday($candidate, $weekdays === [] ? [1] : $weekdays),
            'monthly' => self::nextMonthDay($candidate, $monthDay ?? 1),
            default => throw new \InvalidArgumentException('Unknown rule ' . $rule),
        };
    }

    /** @param list<int> $weekdays */
    private static function nextWeekday(\DateTimeImmutable $from, array $weekdays): \DateTimeImmutable
    {
        for ($i = 0; $i < 7; $i++) {
            $day = $from->modify("+{$i} days");
            if (in_array((int) $day->format('N'), $weekdays, true)) {
                return $day;
            }
        }

        return $from;
    }

    private static function nextMonthDay(\DateTimeImmutable $from, int $monthDay): \DateTimeImmutable
    {
        $monthDay = max(1, min(31, $monthDay));
        $cursor = $from;
        for ($i = 0; $i < 13; $i++) {
            $month = $cursor->modify('first day of this month');
            $day = min($monthDay, (int) $month->format('t'));
            $candidate = $month->setDate((int) $month->format('Y'), (int) $month->format('n'), $day)
                ->setTime((int) $from->format('H'), (int) $from->format('i'));
            if ($candidate >= $from) {
                return $candidate;
            }
            $cursor = $month->modify('+1 month');
        }

        return $from;
    }
}
