<?php

declare(strict_types=1);

namespace Trx\Domain;

final class TaskWorkflow
{
    /**
     * @param array{id:int,role:string} $actor
     * @param array{status:string,creator_id:int} $task
     * @param array<string, mixed> $input
     * @return array{ok:bool,error?:string}
     */
    public static function canTransit(array $actor, array $task, string $to, array $input): array
    {
        $from = (string) $task['status'];
        $allowed = [
            'new' => ['in_progress', 'cancelled'],
            'in_progress' => ['on_review', 'cancelled'],
            'on_review' => ['done', 'in_progress', 'cancelled'],
            'done' => [],
            'cancelled' => [],
        ];
        if (!in_array($to, $allowed[$from] ?? [], true)) {
            return ['ok' => false, 'error' => 'Такой переход статуса недоступен'];
        }
        if ($to === 'cancelled' && trim((string) ($input['cancel_reason'] ?? '')) === '') {
            return ['ok' => false, 'error' => 'Укажите причину отмены'];
        }
        $isCreator = (int) $actor['id'] === (int) $task['creator_id'] || $actor['role'] === 'owner';
        if ($to === 'done' && !$isCreator) {
            return ['ok' => false, 'error' => 'Результат принимает постановщик'];
        }
        if ($from === 'on_review' && $to === 'cancelled' && !$isCreator) {
            return ['ok' => false, 'error' => 'Задачу на проверке отменяет постановщик'];
        }
        if ($from === 'on_review' && $to === 'in_progress') {
            if (!$isCreator) {
                return ['ok' => false, 'error' => 'Вернуть задачу может постановщик'];
            }
            if (trim((string) ($input['comment'] ?? '')) === '') {
                return ['ok' => false, 'error' => 'Нужен комментарий, почему вернули'];
            }
        }

        return ['ok' => true];
    }
}
