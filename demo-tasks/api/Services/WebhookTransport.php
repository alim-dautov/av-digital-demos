<?php

declare(strict_types=1);

namespace Trx\Services;

interface WebhookTransport
{
    /**
     * @param array<string, string> $headers
     * @return array{ok: bool, http_status: int, error: string}
     */
    public function post(string $url, array $headers, string $body, int $timeoutSeconds): array;
}
