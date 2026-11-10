<?php

declare(strict_types=1);

namespace Trx\Domain;

final class OrderPush
{
    /** @return array{created:bool,document_id:string} */
    public static function documentId(string $idempotencyKey, ?string $existing): array
    {
        if ($existing !== null && $existing !== '') {
            return ['created' => false, 'document_id' => $existing];
        }

        return [
            'created' => true,
            'document_id' => 'ONC-TEST-' . substr(hash('sha256', $idempotencyKey), 0, 12),
        ];
    }
}
