<?php

declare(strict_types=1);

namespace Trx\Controllers;

use Trx\Database;
use Trx\Http\Request;
use Trx\Http\Response;
use Trx\Security\Policy;

final class MetaController
{
    public function __construct(private readonly Policy $policy = new Policy())
    {
    }

    public function health(Request $request): void
    {
        try {
            Database::pdo()->query('SELECT 1');
            Response::json(['ok' => true, 'db' => true]);
        } catch (\Throwable $e) {
            Response::json(['ok' => false, 'db' => false, 'error' => 'DB unavailable'], 503);
        }
    }

    /** @param array<string, mixed> $user */
    public function departments(Request $request, array $user): void
    {
        unset($request, $user);
        $rows = Database::pdo()->query(
            'SELECT id, slug, name, color, icon, sort_order FROM departments ORDER BY sort_order, id'
        )->fetchAll(\PDO::FETCH_ASSOC);
        Response::json(['items' => $rows]);
    }

    /** @param array<string, mixed> $user */
    public function nav(Request $request, array $user): void
    {
        $visible = [];
        foreach (Policy::navItems() as $item) {
            if ($item['key'] === 'team') {
                // «Команда» is owner-only (owner + superadmin).
                if (Policy::isOwner($user)) {
                    $visible[] = $item;
                }
                continue;
            }
            if ($item['resource'] === null || $this->policy->can($user, $item['resource'], 'view')) {
                $visible[] = $item;
            }
        }
        Response::json(['items' => $visible]);
    }
}
