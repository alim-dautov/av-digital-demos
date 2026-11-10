<?php

declare(strict_types=1);

/**
 * Copy to config.php (never commit config.php).
 * Local MariaDB example uses port 3307; production usually 3306.
 */
return [
    'app' => [
        'name' => 'Demo CRM',
        'env' => 'production',
        'url' => 'https://demo-tasks.av-digital.kz',
        'timezone' => 'Asia/Almaty',
        'demo_mode' => true,
        'secure_cookies' => true,
    ],
    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'name' => 'CHANGE_ME',
        'user' => 'CHANGE_ME',
        'pass' => 'CHANGE_ME',
        'charset' => 'utf8mb4',
    ],
    // QR screen accounts only (role attendance_display): own session lifetime; global session.lifetime_hours stays.
    'attendance' => [
        'display_session_days' => 30,
    ],
    'session' => [
        'name' => 'demo_session',
        'lifetime_hours' => 12,
        'cookie_path' => '/',
        'same_site' => 'Lax',
    ],
    'auth' => [
        'max_login_attempts' => 5,
        'lockout_minutes' => 15,
        'totp_issuer' => 'Demo CRM',
        'require_totp_roles' => [], // пусто = 2FA выключена
    ],
    'jobs' => [
        'batch_size' => 20,
        'max_attempts' => 5,
    ],
    'vapid' => [
        // Optional: when empty, keys are generated on first use and stored in the settings table.
        'subject' => 'mailto:admin@example.com',
        'public_key' => '',
        'private_key' => '',
    ],
    'deploy' => [
        'host' => '',
        'port' => 21,
        'user' => '',
        'pass' => '',
        'remote_root' => '/public_html',
        'app_url' => '', // https://crm.example.kz: pinged after upload to apply migrations
        'passive' => true,
        'ssl' => true,
    ],
    'grok' => [
        // Ключ шифрования секрета вебхука. В репозиторий не класть.
        // Пусто: CRM смотрит переменную DEMO_WEBHOOK_KEY, затем файл storage/grok.key
        // (создаст сама, если каталог storage доступен для записи).
        // Без ключа CRM работает, но секрет вебхука сохранить нельзя.
        'encryption_key' => '',
        // Адрес, который показывается владельцу как точка входа MCP.
        'public_url' => 'https://demo.example',
    ],
    'wazzup' => [
        // API-ключ Wazzup (wazzup24.com). В репозиторий не класть. Пусто: переменная WAZZUP_API_KEY.
        'api_key' => '',
    ],
    'paths' => [
        'storage' => __DIR__ . '/storage',
        'migrations' => __DIR__ . '/migrations',
    ],
];
