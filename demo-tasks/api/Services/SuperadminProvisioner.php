<?php

declare(strict_types=1);

namespace Trx\Services;

use Trx\Database;
use Trx\Security\Policy;

/**
 * One-time, idempotent creation of the hidden superadmin account.
 * Receives only a password hash; the plaintext never reaches the server or the repo.
 */
final class SuperadminProvisioner
{
    public const USERNAME = 'superadmin';

    /** @return 'created'|'exists' */
    public function ensure(string $passwordHash): string
    {
        $pdo = Database::pdo();
        $exists = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1');
        $exists->execute([self::USERNAME, self::USERNAME . '@demo.local']);
        if ($exists->fetchColumn()) {
            return 'exists';
        }
        $info = password_get_info($passwordHash);
        if (($info['algo'] ?? null) === null || $info['algo'] === 0) {
            throw new AppException('Нужен хэш пароля, а не пароль', 422);
        }
        $pdo->exec(
            "INSERT INTO roles (slug, name, description) VALUES ('superadmin', 'Суперадмин', 'Полный доступ, скрытая служебная учётная запись')
             ON DUPLICATE KEY UPDATE slug = slug"
        );
        $roleId = (int) $pdo->query("SELECT id FROM roles WHERE slug = '" . Policy::SUPERADMIN . "'")->fetchColumn();
        $pdo->prepare(
            'INSERT INTO users (email, username, password_hash, must_change_password, name, initials, role_id, is_active, see_all_tasks)
             VALUES (?, ?, ?, 0, ?, ?, ?, 1, 1)'
        )->execute([self::USERNAME . '@demo.local', self::USERNAME, $passwordHash, 'Суперадмин', 'SA', $roleId]);
        Policy::clearCache();

        return 'created';
    }
}
