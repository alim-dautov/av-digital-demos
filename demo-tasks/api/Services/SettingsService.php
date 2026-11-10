<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;

final class SettingsService
{
    public function get(string $key, mixed $default = null): mixed
    {
        $stmt = Database::pdo()->prepare('SELECT `value` FROM settings WHERE `key` = ?');
        $stmt->execute([$key]);
        $raw = $stmt->fetchColumn();
        if ($raw === false) {
            return $default;
        }
        $decoded = json_decode((string) $raw, true);

        return $decoded ?? $default;
    }

    public function set(string $key, mixed $value): void
    {
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json === false) {
            throw new AppException('Не удалось сохранить настройку');
        }
        Database::pdo()->prepare(
            'INSERT INTO settings (`key`, `value`) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)'
        )->execute([$key, $json]);
    }

    public function forget(string $key): void
    {
        Database::pdo()->prepare('DELETE FROM settings WHERE `key` = ?')->execute([$key]);
    }
}
