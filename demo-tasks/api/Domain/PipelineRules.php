<?php

declare(strict_types=1);

namespace Trx\Domain;

final class PipelineRules
{
    /** @var array<string, array<string, string>> */
    public const REQUIRED = [
        'new_lead' => [
            'client_name' => 'Имя или компания',
            'source' => 'Источник',
        ],
        'contact_made' => [
            'client_replied' => 'Ответ клиента',
        ],
        'need_defined' => [
            'client_task' => 'Задача клиента',
            'product' => 'Товар',
            'requirements' => 'Требования',
        ],
        'proposal_sent' => [
            'has_items' => 'Товары',
            'has_prices' => 'Цены',
            'quote_sent' => 'Факт отправки предложения',
        ],
        'negotiation' => [
            'objection' => 'Возражение или вопрос',
            'next_contact_at' => 'Следующий контакт',
        ],
        'awaiting_payment' => [
            'has_order' => 'Заказ',
            'amount' => 'Сумма',
            'payment_terms' => 'Условия оплаты',
        ],
        'won' => [
            'payment_confirmed' => 'Полная оплата',
            'payment_source' => 'Согласованный источник оплаты',
        ],
        'lost' => [
            'loss_reason' => 'Причина отказа',
        ],
    ];

    /**
     * Быстрая покупка: промежуточные этапы можно пропустить, если заполнены поля цели.
     *
     * @param array<string, mixed> $deal
     * @return array{ok:bool,missing:list<string>}
     */
    public static function canEnter(string $stage, array $deal): array
    {
        $rules = self::REQUIRED[$stage] ?? null;
        if ($rules === null) {
            return ['ok' => false, 'missing' => ['Неизвестный этап']];
        }
        $missing = [];
        foreach ($rules as $field => $label) {
            if (!self::filled($deal[$field] ?? null)) {
                $missing[] = $label;
            }
        }
        if ($stage === 'won') {
            $source = (string) ($deal['payment_source'] ?? '');
            if (!in_array($source, ['onec', 'manual'], true)) {
                $missing[] = 'Источник оплаты: 1С или ручное подтверждение уполномоченного';
            }
            if (($deal['payment_source'] ?? '') === 'message') {
                $missing[] = 'Сообщение клиента не подтверждает оплату';
            }
        }

        return ['ok' => $missing === [], 'missing' => array_values(array_unique($missing))];
    }

    private static function filled(mixed $value): bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if (is_int($value) || is_float($value)) {
            return $value > 0;
        }
        if (is_string($value)) {
            return trim($value) !== '';
        }

        return $value !== null && $value !== [];
    }
}
