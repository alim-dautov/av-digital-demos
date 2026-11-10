<?php

declare(strict_types=1);

/**
 * Local extras that are not accounts.
 * Accounts come from migrations. The owner password is set by scripts/seed_owner.php.
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

$pdo = Database::pdo();
$pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('demo_mode', 'true')
               ON DUPLICATE KEY UPDATE `key` = `key`")->execute();
$pdo->prepare(
    "INSERT INTO jobs (type, payload, status, run_at) VALUES ('ping', '{}', 'pending', NOW())"
)->execute();

echo "seed done\n";
echo "Owner password: php scripts/seed_owner.php with OWNER_PASSWORD set in the environment.\n";
