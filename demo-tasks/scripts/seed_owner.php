<?php

declare(strict_types=1);

/**
 * Sets the owner login to "aidar" and the password from OWNER_PASSWORD.
 * The password is hashed here and is never written to the repository.
 *
 * PowerShell: $env:OWNER_PASSWORD = '...'; php scripts/seed_owner.php
 */

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Auth\AuthService;
use Trx\Config;
use Trx\Database;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

$password = getenv('OWNER_PASSWORD');
if (!is_string($password) || $password === '') {
    fwrite(STDERR, "OWNER_PASSWORD is empty. Set it in the environment and run this script again.\n");
    exit(1);
}
if (mb_strlen($password) < AuthService::MIN_PASSWORD_LENGTH) {
    fwrite(STDERR, 'OWNER_PASSWORD must be at least ' . AuthService::MIN_PASSWORD_LENGTH . " characters.\n");
    exit(1);
}

$pdo = Database::pdo();
$owner = $pdo->query(
    "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' ORDER BY u.id LIMIT 1"
)->fetch(PDO::FETCH_ASSOC);
if (!$owner) {
    fwrite(STDERR, "Owner account was not found. Run php scripts/migrate.php first.\n");
    exit(1);
}

$taken = $pdo->prepare('SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1');
$taken->execute(['aidar', (int) $owner['id']]);
if ($taken->fetchColumn()) {
    fwrite(STDERR, "Username aidar is already used by another account.\n");
    exit(1);
}

$pdo->prepare(
    'UPDATE users SET username = ?, password_hash = ?, must_change_password = 1, is_active = 1, deleted_at = NULL WHERE id = ?'
)->execute(['aidar', password_hash($password, PASSWORD_DEFAULT), (int) $owner['id']]);
$pdo->prepare('DELETE FROM sessions WHERE user_id = ?')->execute([(int) $owner['id']]);

echo "owner login: aidar\n";
echo "password stored as a hash; change it at the first sign-in\n";
