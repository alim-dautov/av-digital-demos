<?php

declare(strict_types=1);

namespace Trx\Domain;

final class DuplicatePolicy
{
    /**
     * @param list<array{id:int|string,phone:string,event_ids?:list<string>}> $openDeals
     * @return array{action:string,deal_id?:int|string,reason:string,needs_context_check?:bool}
     */
    public static function resolve(array $openDeals, string $phone, ?string $eventId, bool $newPurchase): array
    {
        if ($newPurchase) {
            return ['action' => 'create', 'reason' => 'new_purchase'];
        }
        if ($eventId !== null && $eventId !== '') {
            foreach ($openDeals as $deal) {
                $ids = $deal['event_ids'] ?? [];
                if (in_array($eventId, $ids, true)) {
                    return [
                        'action' => 'link',
                        'deal_id' => $deal['id'],
                        'reason' => 'event_id',
                    ];
                }
            }
        }
        if ($phone !== '') {
            foreach ($openDeals as $deal) {
                if (($deal['phone'] ?? '') === $phone) {
                    return [
                        'action' => 'link',
                        'deal_id' => $deal['id'],
                        'reason' => 'open_phone',
                        'needs_context_check' => true,
                    ];
                }
            }
        }

        return ['action' => 'create', 'reason' => 'no_match'];
    }
}
