<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\KpiPlan;
use Trx\Security\Policy;

/**
 * «KPI»: plan / fact per employee per month.
 * Owner (and superadmin) see every employee and edit values in Settings.
 * An employee with the «KPI» module sees only their own row.
 */
final class KpiService
{
    /** @param array<string, mixed> $actor @return array<string, mixed> */
    public function list(array $actor, mixed $period): array
    {
        $period = KpiPlan::period($period, date('Y-m'));
        if ($period === null) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }
        $owner = Policy::isOwner($actor);
        $sql = 'SELECT u.id, u.name, u.initials, d.name dept_name, k.plan, k.fact
                FROM users u
                LEFT JOIN departments d ON d.id = u.department_id
                LEFT JOIN kpi_targets k ON k.user_id = u.id AND k.period = ?
                WHERE u.is_active = 1 AND u.deleted_at IS NULL AND ' . Policy::hideSuperadminSql('u');
        $params = [$period];
        if (!$owner) {
            $sql .= ' AND u.id = ?';
            $params[] = (int) ($actor['user_id'] ?? 0);
        }
        $stmt = Database::pdo()->prepare($sql . ' ORDER BY u.name');
        $stmt->execute($params);
        $rows = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $r) {
            $plan = $r['plan'] !== null ? (float) $r['plan'] : null;
            $fact = $r['fact'] !== null ? (float) $r['fact'] : null;
            $rows[] = [
                'user_id' => (int) $r['id'],
                'name' => (string) $r['name'],
                'initials' => (string) $r['initials'],
                'dept_name' => $r['dept_name'],
                'plan' => $plan,
                'fact' => $fact,
                'percent' => $plan !== null ? KpiPlan::percent($plan, (float) $fact) : null,
            ];
        }

        return ['period' => $period, 'items' => $rows, 'can_edit' => $owner, 'note' => 'Расчёт KPI настраивается'];
    }

    /** @param array<string, mixed> $actor @param array<string, mixed> $input @return array<string, mixed> */
    public function save(array $actor, array $input): array
    {
        if (!Policy::isOwner($actor)) {
            throw new AppException('Недостаточно прав', 403);
        }
        $period = KpiPlan::period($input['period'] ?? null);
        if ($period === null) {
            throw new AppException('Период должен быть в формате ГГГГ-ММ', 422);
        }
        $items = $input['items'] ?? null;
        if (!is_array($items)) {
            throw new AppException('Нет данных', 422);
        }
        $pdo = Database::pdo();
        $valid = $pdo->prepare('SELECT COUNT(*) FROM users u WHERE u.id = ? AND ' . Policy::hideSuperadminSql('u'));
        $upsert = $pdo->prepare(
            'INSERT INTO kpi_targets (user_id, period, plan, fact, updated_by) VALUES (?,?,?,?,?)
             ON DUPLICATE KEY UPDATE plan = VALUES(plan), fact = VALUES(fact), updated_by = VALUES(updated_by)'
        );
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $uid = (int) ($item['user_id'] ?? 0);
            $valid->execute([$uid]);
            if ((int) $valid->fetchColumn() !== 1) {
                throw new AppException('Сотрудник не найден', 422);
            }
            $plan = $this->num($item['plan'] ?? 0);
            $fact = $this->num($item['fact'] ?? 0);
            $upsert->execute([$uid, $period, $plan, $fact, (int) ($actor['user_id'] ?? 0) ?: null]);
        }

        return $this->list($actor, $period);
    }

    private function num(mixed $v): float
    {
        if ($v === null || $v === '') {
            return 0.0;
        }
        if (is_string($v)) {
            $v = str_replace([' ', ','], ['', '.'], $v);
        }
        if (!is_numeric($v) || (float) $v < 0) {
            throw new AppException('План и факт — неотрицательные числа', 422);
        }

        return (float) $v;
    }
}
