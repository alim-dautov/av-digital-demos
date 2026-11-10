<?php

declare(strict_types=1);

namespace Trx\Domain;

use Trx\Services\AppException;

/**
 * Line items and total for a commercial offer.
 * Row sum = qty × price (rounded to tiyn). Total = subtotal − discount, never below zero.
 */
final class KpTotals
{
    public const MAX_ITEMS = 200;

    /**
     * @param mixed $raw list of {name, qty, unit, price}
     * @return list<array{name: string, qty: float, unit: string, price: float, sum: float}>
     */
    public static function items(mixed $raw): array
    {
        if (!is_array($raw) || !array_is_list($raw)) {
            throw new AppException('items — список позиций', 422);
        }
        if (count($raw) > self::MAX_ITEMS) {
            throw new AppException('Не больше ' . self::MAX_ITEMS . ' позиций', 422);
        }
        $out = [];
        foreach ($raw as $i => $row) {
            $n = $i + 1;
            if (!is_array($row)) {
                throw new AppException("Позиция {$n}: неверный формат", 422);
            }
            $name = is_string($row['name'] ?? null) ? trim($row['name']) : '';
            if ($name === '' || mb_strlen($name) > 500) {
                throw new AppException("Позиция {$n}: укажите наименование", 422);
            }
            $qty = self::number($row['qty'] ?? 1, "Позиция {$n}: количество должно быть больше нуля");
            if ($qty <= 0) {
                throw new AppException("Позиция {$n}: количество должно быть больше нуля", 422);
            }
            $price = self::number($row['price'] ?? 0, "Позиция {$n}: цена — неотрицательное число");
            $unit = is_string($row['unit'] ?? null) ? mb_substr(trim($row['unit']), 0, 32) : '';
            $out[] = ['name' => $name, 'qty' => $qty, 'unit' => $unit === '' ? 'шт' : $unit, 'price' => $price, 'sum' => round($qty * $price, 2)];
        }

        return $out;
    }

    /** @param list<array{sum: float}> $items */
    public static function subtotal(array $items): float
    {
        return round(array_sum(array_column($items, 'sum')), 2);
    }

    public static function discount(float $subtotal, ?string $type, ?float $value): float
    {
        if ($type === null || $value === null || $value <= 0) {
            return 0.0;
        }
        $d = $type === 'percent' ? $subtotal * min($value, 100) / 100 : $value;

        return round(min($d, $subtotal), 2);
    }

    /** @param list<array{sum: float}> $items */
    public static function total(array $items, ?string $type, ?float $value): float
    {
        $sub = self::subtotal($items);

        return round(max(0, $sub - self::discount($sub, $type, $value)), 2);
    }

    public static function number(mixed $v, string $error): float
    {
        if (is_string($v)) {
            $v = str_replace([' ', "\u{00A0}", ','], ['', '', '.'], trim($v));
        }
        if (!is_numeric($v) || (float) $v < 0 || (float) $v > 999999999999) {
            throw new AppException($error, 422);
        }

        return (float) $v;
    }
}
