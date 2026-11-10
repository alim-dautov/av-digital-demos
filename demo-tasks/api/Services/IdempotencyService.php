<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;

final class IdempotencyService
{
    /** @return array{code: int, body: mixed}|null */
    public function find(int $userId, string $key): ?array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT response_code, response_body FROM idempotency_keys WHERE user_id = ? AND idem_key = ? LIMIT 1'
        );
        $stmt->execute([$userId, $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'code' => (int) $row['response_code'],
            'body' => $row['response_body'] !== null ? json_decode((string) $row['response_body'], true) : null,
        ];
    }

    public function store(
        int $userId,
        string $key,
        string $method,
        string $path,
        string $requestHash,
        int $code,
        mixed $body,
    ): void {
        $stmt = Database::pdo()->prepare(
            'INSERT INTO idempotency_keys (user_id, idem_key, method, path, request_hash, response_code, response_body)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE response_code = VALUES(response_code)'
        );
        $stmt->execute([
            $userId,
            $key,
            $method,
            $path,
            $requestHash,
            $code,
            $body === null ? null : json_encode($body, JSON_UNESCAPED_UNICODE),
        ]);
    }
}
