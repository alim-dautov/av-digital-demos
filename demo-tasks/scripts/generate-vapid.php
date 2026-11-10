<?php

declare(strict_types=1);

/**
 * Prints a fresh VAPID key pair for Web Push. Paste it into config.php → 'vapid'.
 * Generate once per environment: changing keys invalidates all existing browser subscriptions.
 *
 * Usage: php scripts/generate-vapid.php
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Minishlink\WebPush\VAPID;

$keys = VAPID::createVapidKeys();

echo "'public_key' => '{$keys['publicKey']}',\n";
echo "'private_key' => '{$keys['privateKey']}',\n";
