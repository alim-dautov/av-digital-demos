<?php

declare(strict_types=1);

/**
 * Creates staff accounts with a temporary password. Existing accounts are left untouched,
 * so passwords that employees already changed are never reset.
 *
 * Usage: php scripts/seed_staff.php
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

const TEMP_PASSWORD = 'passworddemo';

$staff = [
    ['username' => 'daniyar', 'name' => 'Данияр', 'initials' => 'ДН', 'phone' => '+7 700 000 00 01', 'role' => 'employee', 'dept' => 'sales'],
    ['username' => 'timur', 'name' => 'Тимур', 'initials' => 'ТМ', 'phone' => '+7 700 000 00 02', 'role' => 'employee', 'dept' => 'sales'],
    ['username' => 'erlan', 'name' => 'Ерлан', 'initials' => 'ЕР', 'phone' => '+7 700 000 00 03', 'role' => 'employee', 'dept' => 'sales'],
    ['username' => 'arman', 'name' => 'Арман', 'initials' => 'АР', 'phone' => '+7 700 000 00 04', 'role' => 'employee', 'dept' => 'sales'],
    ['username' => 'dinara', 'name' => 'Динара', 'initials' => 'ДИ', 'phone' => '+7 700 000 00 05', 'role' => 'employee', 'dept' => 'sales'],
];

$pdo = Database::pdo();
$roleStmt = $pdo->prepare('SELECT id FROM roles WHERE slug = ?');
$deptStmt = $pdo->prepare('SELECT id FROM departments WHERE slug = ?');
$existsStmt = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
$insert = $pdo->prepare(
    'INSERT INTO users (email, username, password_hash, must_change_password, name, initials, phone, role_id, department_id, is_active)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, 1)'
);

foreach ($staff as $u) {
    $email = $u['username'] . '@demo.local';
    $existsStmt->execute([$u['username'], $email]);
    if ($existsStmt->fetchColumn()) {
        echo "skip {$u['username']}: already exists\n";
        continue;
    }

    $roleStmt->execute([$u['role']]);
    $roleId = (int) $roleStmt->fetchColumn();
    $deptStmt->execute([$u['dept']]);
    $deptId = (int) $deptStmt->fetchColumn();
    if (!$roleId) {
        fwrite(STDERR, "role {$u['role']} not found: run migrations first\n");
        exit(1);
    }

    $insert->execute([
        $email,
        $u['username'],
        password_hash(TEMP_PASSWORD, PASSWORD_DEFAULT),
        $u['name'],
        $u['initials'],
        $u['phone'],
        $roleId,
        $deptId ?: null,
    ]);
    $userId = (int) $pdo->lastInsertId();
    $grant = $pdo->prepare('INSERT IGNORE INTO user_modules (user_id, module) VALUES (?, ?)');
    foreach (['dashboard', 'tasks', 'sales'] as $module) {
        $grant->execute([$userId, $module]);
    }
    echo "user {$u['username']}\n";
}

echo "done\n";
