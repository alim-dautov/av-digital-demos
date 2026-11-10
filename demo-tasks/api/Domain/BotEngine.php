<?php

declare(strict_types=1);

namespace Trx\Domain;

final class BotEngine
{
    /**
     * @param array{handed_off?:bool,fresh?:bool,products?:list<array{name:string,price:int,sku:string}>,knowledge?:array<string,string>} $ctx
     * @return array{reply:string,handoff:bool,reason:?string,slots:array<string,string>,stop:bool}
     */
    public static function turn(string $text, array $ctx): array
    {
        $q = mb_strtolower(trim($text));
        if (!empty($ctx['handed_off'])) {
            return [
                'reply' => '',
                'handoff' => true,
                'reason' => 'already',
                'slots' => [],
                'stop' => true,
            ];
        }
        $handoffNeedles = ['жалоб', 'возврат', 'гарант', 'скидк', 'скрин', 'оплатил', 'чек об оплат', 'парол', 'карт', 'cvv', 'игнорируй', 'системн', 'внутренн', 'покажи базу', 'секрет'];
        foreach ($handoffNeedles as $needle) {
            if (str_contains($q, $needle)) {
                return self::hand('Передаю диалог менеджеру. Я автоматический помощник и не продолжаю ответы.', 'sensitive');
            }
        }
        if (empty($ctx['fresh'])) {
            return self::hand('Цены или остатки давно не обновлялись. Передаю менеджеру, наличие не обещаю.', 'stale');
        }
        $products = $ctx['products'] ?? [];
        $known = null;
        foreach ($products as $product) {
            if (str_contains($q, mb_strtolower((string) $product['name'])) || str_contains($q, mb_strtolower((string) $product['sku']))) {
                $known = $product;
                break;
            }
        }
        if (str_contains($q, 'есть ли') || str_contains($q, 'цена') || str_contains($q, 'сколько стоит')) {
            if ($known === null) {
                return self::hand('Этой позиции нет в подтверждённом каталоге. Передаю менеджеру.', 'unknown_product');
            }

            return [
                'reply' => 'Я автоматический помощник. В каталоге есть ' . $known['name'] . ', артикул ' . $known['sku'] . '. Цену и наличие подтвердит менеджер по актуальному обмену. Напишите задачу, бюджет и город доставки.',
                'handoff' => false,
                'reason' => null,
                'slots' => ['product' => (string) $known['name']],
                'stop' => false,
            ];
        }
        $slots = [];
        if (preg_match('/бюджет[^\d]*(\d[\d\s]*)/u', $q, $m)) {
            $slots['budget'] = preg_replace('/\s+/', '', $m[1]) ?? $m[1];
        }
        if (preg_match('/город[:\s]+([а-яё\-]+)/u', $q, $m)) {
            $slots['city'] = $m[1];
        }
        if (preg_match('/нужен\s+([а-яё0-9\- ]{3,40})/u', $q, $m)) {
            $slots['tool'] = trim($m[1]);
        }
        if (preg_match('/задач[ауи][:\s]+([^.]{3,80})/u', $q, $m)) {
            $slots['task'] = trim($m[1]);
        }
        $knowledge = $ctx['knowledge'] ?? [];
        foreach (['оплата' => 'оплат', 'доставка' => 'достав', 'гарантия' => 'гарант'] as $topic => $needle) {
            if (str_contains($q, $needle)) {
                $body = trim((string) ($knowledge[$topic] ?? ''));
                if ($body === '' || str_contains(mb_strtolower($body), 'не утверж')) {
                    return self::hand('Утверждённого ответа по этой теме нет. Передаю менеджеру.', 'no_knowledge');
                }

                return [
                    'reply' => 'Я автоматический помощник. ' . $body,
                    'handoff' => false,
                    'reason' => null,
                    'slots' => $slots,
                    'stop' => false,
                ];
            }
        }

        return [
            'reply' => 'Я автоматический помощник DEMO. Напишите, какой инструмент нужен, для какой задачи, бюджет и город доставки. Оплату по скриншоту не подтверждаю.',
            'handoff' => false,
            'reason' => null,
            'slots' => $slots,
            'stop' => false,
        ];
    }

    /** @return array{reply:string,handoff:bool,reason:string,slots:array<string,string>,stop:bool} */
    private static function hand(string $reply, string $reason): array
    {
        return [
            'reply' => $reply,
            'handoff' => true,
            'reason' => $reason,
            'slots' => [],
            'stop' => true,
        ];
    }
}
