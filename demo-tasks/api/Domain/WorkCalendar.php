<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Working days for regular tasks: Mon–Fri minus owner-entered holidays, and per-person vacations.
 */
final class WorkCalendar
{
    /**
     * @param list<string> $holidays Y-m-d
     * @param array<int, list<array{0:string,1:string}>> $vacations user id => [starts_on, ends_on] (inclusive)
     */
    public function __construct(private readonly array $holidays = [], private readonly array $vacations = [])
    {
    }

    public function isWorkingDay(string $day): bool
    {
        $n = (int) (new \DateTimeImmutable($day))->format('N');

        return $n <= 5 && !in_array($day, $this->holidays, true);
    }

    public function onVacation(int $userId, string $day): bool
    {
        foreach ($this->vacations[$userId] ?? [] as [$from, $to]) {
            if ($day >= $from && $day <= $to) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param list<int> $userIds
     * @return list<int> people who are at work that day
     */
    public function present(array $userIds, string $day): array
    {
        return array_values(array_filter($userIds, fn (int $id): bool => !$this->onVacation($id, $day)));
    }
}
