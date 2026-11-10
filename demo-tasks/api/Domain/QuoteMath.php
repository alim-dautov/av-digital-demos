<?php

declare(strict_types=1);

namespace Trx\Domain;

final class QuoteMath
{
    public static function lineTotal(int $qty, int $price, float $discountPct): int
    {
        $gross = $qty * $price;
        $discount = (int) round($gross * ($discountPct / 100));

        return max(0, $gross - $discount);
    }

    /** @param list<array{qty:int,price:int,discount_pct:float}> $lines */
    public static function total(array $lines): int
    {
        $sum = 0;
        foreach ($lines as $line) {
            $sum += self::lineTotal((int) $line['qty'], (int) $line['price'], (float) $line['discount_pct']);
        }

        return $sum;
    }

    public static function needsApproval(float $discountPct, float $threshold): bool
    {
        return $discountPct > $threshold;
    }

    public static function priceAllowed(int $price, int $minPrice, bool $canOverrideMin): bool
    {
        if ($canOverrideMin) {
            return $price > 0;
        }

        return $price >= $minPrice && $price > 0;
    }
}
