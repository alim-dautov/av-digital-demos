<?php

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    exit(1);
}

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;

$php = 'C:\\Program Files\\MariaDB 13\\bin\\mysqldump.exe';
if (!is_file($php)) {
    $php = 'mysqldump';
}
$dir = dirname(__DIR__) . '/storage/backups';
if (!is_dir($dir)) {
    mkdir($dir, 0775, true);
}
$file = $dir . '/demo-' . date('Ymd-His') . '.sql';
$cmd = escapeshellarg($php)
    . ' -h ' . escapeshellarg((string) Config::get('db.host'))
    . ' -P ' . (int) Config::get('db.port')
    . ' -u ' . escapeshellarg((string) Config::get('db.user'))
    . ' ' . escapeshellarg((string) Config::get('db.name'))
    . ' > ' . escapeshellarg($file);
passthru($cmd, $code);
if ($code !== 0) {
    fwrite(STDERR, "backup failed\n");
    exit(1);
}
foreach (glob($dir . '/demo-*.sql') ?: [] as $old) {
    if (filemtime($old) < time() - 30 * 86400) {
        unlink($old);
    }
}
echo "saved {$file}\n";
