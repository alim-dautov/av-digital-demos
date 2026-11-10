<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use RuntimeException;
use Trx\Config;
use Trx\Database;

/**
 * Applies migrations/*.sql in name order, once each. ensureUpToDate() is cheap enough to call on
 * every request: a stamp file with the migration list fingerprint skips the database check.
 */
final class Migrator
{
    private const LOCK_NAME = 'demo_migrate';
    private const LOCK_WAIT_SECONDS = 30;

    public function ensureUpToDate(): void
    {
        $fingerprint = $this->fingerprint();
        $stamp = $this->stampPath();
        if (is_file($stamp) && trim((string) file_get_contents($stamp)) === $fingerprint) {
            return;
        }
        $this->run();
        if (is_dir(dirname($stamp)) || @mkdir(dirname($stamp), 0775, true)) {
            @file_put_contents($stamp, $fingerprint);
        }
    }

    /**
     * @param (callable(string): void)|null $log
     * @return list<string> applied file names
     */
    public function run(?callable $log = null): array
    {
        $pdo = Database::pdo();
        $locked = (int) $pdo->query("SELECT GET_LOCK('" . self::LOCK_NAME . "', " . self::LOCK_WAIT_SECONDS . ')')->fetchColumn();
        if ($locked !== 1) {
            throw new RuntimeException('Another migration is running');
        }
        try {
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS schema_migrations (
                    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                    filename VARCHAR(255) NOT NULL UNIQUE,
                    applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
            );
            $done = $pdo->query('SELECT filename FROM schema_migrations')->fetchAll(PDO::FETCH_COLUMN);
            $applied = [];
            foreach ($this->files() as $file) {
                $name = basename($file);
                if (in_array($name, $done, true)) {
                    $log && $log("skip {$name}");
                    continue;
                }
                $log && $log("apply {$name}");
                $sql = file_get_contents($file);
                if ($sql === false) {
                    throw new RuntimeException("Cannot read {$file}");
                }
                // DDL auto-commits in MySQL, so migration files are not wrapped in transactions.
                try {
                    foreach (self::split($sql) as $statement) {
                        $pdo->exec($statement);
                    }
                } catch (\Throwable $e) {
                    throw new RuntimeException("Migration {$name} failed: {$e->getMessage()}", 0, $e);
                }
                $pdo->prepare('INSERT INTO schema_migrations (filename) VALUES (?)')->execute([$name]);
                $applied[] = $name;
            }

            return $applied;
        } finally {
            $pdo->query("SELECT RELEASE_LOCK('" . self::LOCK_NAME . "')");
        }
    }

    /** @return list<string> */
    public static function split(string $sql): array
    {
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
        $parts = preg_split('/;\s*[\r\n]+/', $sql) ?: [];

        return array_values(array_filter(array_map('trim', $parts), static fn (string $part): bool => $part !== ''));
    }

    /** @return list<string> */
    private function files(): array
    {
        $dir = (string) Config::get('paths.migrations', dirname(__DIR__, 2) . '/migrations');
        $files = glob($dir . '/*.sql') ?: [];
        sort($files);

        return $files;
    }

    private function fingerprint(): string
    {
        return md5(implode('|', array_map(static fn (string $f): string => basename($f) . ':' . filesize($f), $this->files())));
    }

    private function stampPath(): string
    {
        return (string) Config::get('paths.storage', dirname(__DIR__, 2) . '/storage') . '/cache/migrations.stamp';
    }
}
