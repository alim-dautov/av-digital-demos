<?php

declare(strict_types=1);

/**
 * PHP built-in server router: php -S 127.0.0.1:8080 router-dev.php
 */
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$root = __DIR__ . '/public_html';

if (str_starts_with($uri, '/api')) {
    require __DIR__ . '/api/bootstrap.php';

    return true;
}

$file = $root . $uri;
if ($uri !== '/' && is_file($file)) {
    $ext = pathinfo($file, PATHINFO_EXTENSION);
    $types = [
        'css' => 'text/css',
        'js' => 'application/javascript',
        'mjs' => 'application/javascript',
        'json' => 'application/json',
        'webmanifest' => 'application/manifest+json',
        'png' => 'image/png',
        'svg' => 'image/svg+xml',
        'ico' => 'image/x-icon',
        'woff2' => 'font/woff2',
        'map' => 'application/json',
    ];
    if (isset($types[$ext])) {
        header('Content-Type: ' . $types[$ext]);
    }
    $base = basename($file);
    if (preg_match('/-[A-Za-z0-9]{8,}\.(js|css|woff2|woff|png|jpe?g|webp|svg|gif)$/', $base) && str_contains($uri, '/assets/')) {
        header('Cache-Control: public, max-age=31536000, immutable');
    } elseif (in_array($base, ['index.html', 'offline.html', 'sw.js', 'push-sw.js', 'registerSW.js', 'manifest.webmanifest'], true) || str_starts_with($base, 'workbox-')) {
        header('Cache-Control: no-cache, no-store, must-revalidate');
    }
    readfile($file);

    return true;
}

$index = $root . '/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate');
    readfile($index);

    return true;
}

http_response_code(404);
echo 'Not found';

return true;
