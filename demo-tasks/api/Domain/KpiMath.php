<?php

declare(strict_types=1);

namespace Trx\Domain;

/**
 * Формулы блока 4 ТЗ. Суммы — целые тенге. Даты учёта — Y-m-d, пояс Asia/Almaty передаёт вызывающий код.
 */
final class KpiMath
{
    /** @param list<array{id:int|string,created_on:string,is_test?:bool,is_duplicate?:bool}> $deals */
    public static function newLeads(array $deals, string $from, string $to): int
    {
        $ids = [];
        foreach ($deals as $deal) {
            if (!empty($deal['is_test']) || !empty($deal['is_duplicate'])) {
                continue;
            }
            $day = (string) $deal['created_on'];
            if ($day < $from || $day > $to) {
                continue;
            }
            $ids[(string) $deal['id']] = true;
        }

        return count($ids);
    }

    /**
     * @param list<array{id:int|string,created_on:string,paid_on?:?string,is_test?:bool,is_duplicate?:bool}> $deals
     * @return array{percent:?float,paid:int,total:int}
     */
    public static function cohortConversion(array $deals, string $from, string $to, string $reportDate): array
    {
        $total = 0;
        $paid = 0;
        $seen = [];
        foreach ($deals as $deal) {
            if (!empty($deal['is_test']) || !empty($deal['is_duplicate'])) {
                continue;
            }
            $id = (string) $deal['id'];
            if (isset($seen[$id])) {
                continue;
            }
            $created = (string) $deal['created_on'];
            if ($created < $from || $created > $to) {
                continue;
            }
            $seen[$id] = true;
            $total++;
            $paidOn = $deal['paid_on'] ?? null;
            if (is_string($paidOn) && $paidOn !== '' && $paidOn <= $reportDate) {
                $paid++;
            }
        }

        return [
            'percent' => $total === 0 ? null : round($paid / $total * 100, 1),
            'paid' => $paid,
            'total' => $total,
        ];
    }

    /** @param list<array{kind:string,amount:int,on:string}> $movements */
    public static function receipts(array $movements, string $from, string $to): int
    {
        $sum = 0;
        foreach ($movements as $row) {
            $day = (string) $row['on'];
            if ($day < $from || $day > $to) {
                continue;
            }
            $amount = (int) $row['amount'];
            if ($row['kind'] === 'refund') {
                $sum -= $amount;
            } elseif ($row['kind'] === 'payment') {
                $sum += $amount;
            }
        }

        return $sum;
    }

    /** @param list<array{amount:int,fully_paid_on?:?string}> $orders */
    public static function averagePaidCheck(array $orders, string $from, string $to): ?float
    {
        $sum = 0;
        $count = 0;
        foreach ($orders as $order) {
            $day = $order['fully_paid_on'] ?? null;
            if (!is_string($day) || $day === '' || $day < $from || $day > $to) {
                continue;
            }
            $sum += (int) $order['amount'];
            $count++;
        }

        return $count === 0 ? null : round($sum / $count, 2);
    }

    /** @return array{state:string,percent:?float} */
    public static function planRatio(float $fact, float $plan): array
    {
        if ($plan == 0.0) {
            return ['state' => 'unset', 'percent' => null];
        }

        return ['state' => 'ok', 'percent' => round($fact / $plan * 100, 1)];
    }

    public static function cpl(int $spend, int $leads): ?float
    {
        if ($leads <= 0) {
            return null;
        }

        return round($spend / $leads, 2);
    }

    /** @return array{value:?float,as_of:string} */
    public static function costOfSale(int $spend, int $paidCohort, string $asOf): array
    {
        return [
            'value' => $paidCohort <= 0 ? null : round($spend / $paidCohort, 2),
            'as_of' => $asOf,
        ];
    }

    /** @param list<array{status:string,due_on?:?string}> $tasks */
    public static function overdueOpen(array $tasks, string $asOf): int
    {
        $n = 0;
        foreach ($tasks as $task) {
            if (in_array($task['status'], ['done', 'cancelled'], true)) {
                continue;
            }
            $due = $task['due_on'] ?? null;
            if (is_string($due) && $due !== '' && $due < $asOf) {
                $n++;
            }
        }

        return $n;
    }

    /** @param list<array{status:string,due_on?:?string,completed_on?:?string}> $tasks */
    public static function onTimePercent(array $tasks): ?float
    {
        $done = 0;
        $onTime = 0;
        foreach ($tasks as $task) {
            if ($task['status'] !== 'done') {
                continue;
            }
            $due = $task['due_on'] ?? null;
            $completed = $task['completed_on'] ?? null;
            if (!is_string($due) || $due === '' || !is_string($completed) || $completed === '') {
                continue;
            }
            $done++;
            if ($completed <= $due) {
                $onTime++;
            }
        }

        return $done === 0 ? null : round($onTime / $done * 100, 1);
    }

    /**
     * @param list<array{received_at:string,human_reply_at?:?string}> $leads
     * @return array{calendar_avg:?float,business_avg:?float,answered:int,unanswered:int}
     */
    public static function firstResponse(array $leads, BusinessCalendar $calendar): array
    {
        $cal = 0;
        $biz = 0;
        $answered = 0;
        $unanswered = 0;
        foreach ($leads as $lead) {
            $reply = $lead['human_reply_at'] ?? null;
            if (!is_string($reply) || $reply === '') {
                $unanswered++;
                continue;
            }
            $span = $calendar->minutesBetween(
                new \DateTimeImmutable($lead['received_at']),
                new \DateTimeImmutable($reply)
            );
            $answered++;
            $cal += $span['calendar'];
            $biz += $span['business'];
        }

        return [
            'calendar_avg' => $answered === 0 ? null : round($cal / $answered, 1),
            'business_avg' => $answered === 0 ? null : round($biz / $answered, 1),
            'answered' => $answered,
            'unanswered' => $unanswered,
        ];
    }
}
