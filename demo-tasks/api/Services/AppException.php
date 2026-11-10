<?php

declare(strict_types=1);

namespace Trx\Services;

final class AppException extends \RuntimeException
{
    /** @param array<string, mixed> $extra machine-readable fields added to the JSON error (e.g. code) */
    public function __construct(string $message, public readonly int $status = 422, public readonly array $extra = [])
    {
        parent::__construct($message);
    }
}
