<?php

declare(strict_types=1);

/**
 * Nightly demo reset (cron): wipes working data, re-seeds the catalog and demo
 * deals/tasks, and restores the shared demo password for every account.
 *
 * Usage: php scripts/reset_demo.php
 * Refuses to run unless app.demo_mode is true in config.php.
 */
require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;

if (!(bool) Config::get('app.demo_mode', false)) {
    fwrite(STDERR, "Not a demo install (app.demo_mode is false) — refusing to reset.\n");
    exit(1);
}

$pdo = Database::pdo();
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
$pdo->exec('DELETE FROM stock');
$pdo->exec('DELETE FROM products');
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$php = PHP_BINARY;
$root = dirname(__DIR__);
foreach ([['reset_data.php', '--yes'], ['seed_crm.php'], ['seed_workdata.php']] as $step) {
    $cmd = escapeshellarg($php) . ' ' . escapeshellarg($root . '/scripts/' . $step[0]) . (isset($step[1]) ? ' ' . $step[1] : '');
    passthru($cmd, $code);
    if ($code !== 0) {
        fwrite(STDERR, "Step {$step[0]} failed ({$code})\n");
        exit($code);
    }
}

$stmt = $pdo->prepare('UPDATE users SET password_hash = ?, must_change_password = 0');
$stmt->execute([password_hash('demo12345', PASSWORD_DEFAULT)]);
$pdo->exec('DELETE FROM sessions');
echo "Demo reset done at " . date('c') . "\n";
