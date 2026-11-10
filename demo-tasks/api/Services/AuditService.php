<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;

final class AuditService
{
    public function log(
        ?int $userId,
        string $entityType,
        string $entityId,
        string $action,
        mixed $before,
        mixed $after,
        ?string $ip = null,
    ): void {
        $stmt = Database::pdo()->prepare(
            'INSERT INTO audit_log (user_id, entity_type, entity_id, action, before_json, after_json, ip)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([
            $userId,
            $entityType,
            $entityId,
            $action,
            $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE),
            $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE),
            $ip,
        ]);
    }
}
