<?php

declare(strict_types=1);

namespace Trx\Domain;

final class ManagerScore
{
    /**
     * @param list<array{weight:int,result:string}> $items result: done|fail|na|unknown
     * @return array{percent:?float,completeness:float,comparable:bool,label:string}
     */
    public static function summarize(array $items, float $minCompleteness = 0.6): array
    {
        $max = 0;
        $earned = 0;
        $applicable = 0;
        $scored = 0;
        foreach ($items as $item) {
            $weight = (int) $item['weight'];
            $result = (string) $item['result'];
            if ($result === 'na') {
                continue;
            }
            $applicable++;
            $max += $weight;
            if ($result === 'unknown') {
                continue;
            }
            $scored++;
            if ($result === 'done') {
                $earned += $weight;
            }
        }
        $completeness = $applicable === 0 ? 0.0 : $scored / $applicable;
        $percent = $max === 0 ? null : round($earned / $max * 100, 1);

        return [
            'percent' => $percent,
            'completeness' => round($completeness * 100, 1),
            'comparable' => $percent !== null && $completeness >= $minCompleteness,
            'label' => 'оценка ИИ',
        ];
    }
}
