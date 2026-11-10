<?php

declare(strict_types=1);

namespace Trx\Domain;

final class CallIngest
{
    /**
     * Повтор события обновляет звонок. Пропущенный создаёт одну задачу обратного звонка.
     *
     * @param array<string, mixed>|null $existing
     * @param array<string, mixed> $event
     * @return array{call:array<string,mixed>,updated:bool,create_callback:bool}
     */
    public static function apply(?array $existing, array $event, bool $callbackExists): array
    {
        $call = $existing ?? [];
        foreach (['external_id', 'direction', 'phone', 'user_id', 'started_at', 'connected_at', 'duration_sec', 'result', 'recording_url'] as $key) {
            if (array_key_exists($key, $event) && $event[$key] !== null && $event[$key] !== '') {
                $call[$key] = $event[$key];
            }
        }
        $result = (string) ($call['result'] ?? '');

        return [
            'call' => $call,
            'updated' => $existing !== null,
            'create_callback' => $result === 'missed' && !$callbackExists,
        ];
    }
}
