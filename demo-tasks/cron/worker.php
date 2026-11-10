<?php

declare(strict_types=1);

/**
 * Hosting cron every minute:
 * php /path/to/cron/worker.php
 */
if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "CLI only\n");
    exit(1);
}

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Services\JobRunner;
use Trx\Services\Migrator;
use Trx\Services\Scheduler;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

(new Migrator())->ensureUpToDate();

$workerId = gethostname() . '-' . getmypid();
$scheduled = (new Scheduler())->tick();
$runner = new JobRunner();
$count = $runner->run($workerId);

$logDir = (string) Config::get('paths.storage') . '/logs';
if (!is_dir($logDir)) {
    mkdir($logDir, 0775, true);
}
$line = date('c') . " worker={$workerId} scheduled=" . (implode(',', $scheduled) ?: '-') . " processed={$count}\n";
file_put_contents($logDir . '/cron.log', $line, FILE_APPEND);

echo $line;
