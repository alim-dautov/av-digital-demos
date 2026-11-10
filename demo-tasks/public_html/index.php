<?php

declare(strict_types=1);

/**
 * Front controller for /api/* on shared hosting.
 * Static SPA files are served directly by Apache when they exist.
 */
$uri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($uri, PHP_URL_PATH) ?: '/';

if (str_starts_with($path, '/api')) {
    require dirname(__DIR__) . '/api/bootstrap.php';
    exit;
}

// SPA fallback for PHP built-in server / misconfigured rewrite
$index = __DIR__ . '/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    exit;
}

http_response_code(404);
echo 'Demo CRM: frontend not built. Run npm run build in frontend/.';
