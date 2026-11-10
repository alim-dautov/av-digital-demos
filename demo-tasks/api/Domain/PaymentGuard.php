<?php

declare(strict_types=1);

namespace Trx\Domain;

final class PaymentGuard
{
    /** @return array{ok:bool,error?:string,source?:string,label?:string} */
    public static function manualConfirm(bool $authorized, string $evidence): array
    {
        if (!$authorized) {
            return ['ok' => false, 'error' => 'Недостаточно прав для ручного подтверждения'];
        }
        if (trim($evidence) === '') {
            return ['ok' => false, 'error' => 'Нужно доказательство оплаты'];
        }

        return ['ok' => true, 'source' => 'manual', 'label' => 'ручное подтверждение'];
    }

    /** @return array{ok:false,error:string} */
    public static function fromClientMessage(): array
    {
        return ['ok' => false, 'error' => 'Оплата по сообщению или скриншоту не подтверждается'];
    }
}
