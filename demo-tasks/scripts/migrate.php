<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Services\Migrator;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

try {
    (new Migrator())->run(static function (string $line): void {
        echo $line . "\n";
    });
} catch (Throwable $e) {
    fwrite(STDERR, "FAILED: {$e->getMessage()}\n");
    exit(1);
}

echo "done\n";
