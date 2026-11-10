<?php

declare(strict_types=1);

namespace Trx\Domain;

final class StockFreshness
{
    public static function warning(?string $syncedAt, int $nowTs, int $maxAgeSeconds = 300): ?string
    {
        if ($syncedAt === null || $syncedAt === '') {
            return 'Обмен с 1С ещё не выполнялся. Наличие не обещаем.';
        }
        $ts = strtotime($syncedAt);
        if ($ts === false || ($nowTs - $ts) > $maxAgeSeconds) {
            return 'Данные 1С устарели. Наличие не обещаем без проверки.';
        }

        return null;
    }
}
