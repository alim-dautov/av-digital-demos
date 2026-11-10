<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Security\Policy;

final class CashService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function list(array $user, array $filters): array
    {
        $this->allow($user);
        $sql = 'SELECT o.id, o.kind, o.amount, o.occurred_on, o.comment, o.client_id, o.created_by, o.created_at,
                       c.name AS client_name, u.name AS author_name
                FROM cash_operations o
                JOIN users u ON u.id = o.created_by
                LEFT JOIN clients c ON c.id = o.client_id
                WHERE 1 = 1';
        $params = [];
        if (!empty($filters['kind'])) {
            $kind = (string) $filters['kind'];
            if (!in_array($kind, ['income', 'expense'], true)) {
                throw new AppException('kind: income или expense', 422);
            }
            $sql .= ' AND o.kind = ?';
            $params[] = $kind;
        }
        if (!empty($filters['from'])) {
            $sql .= ' AND o.occurred_on >= ?';
            $params[] = $this->date($filters['from']);
        }
        if (!empty($filters['to'])) {
            $sql .= ' AND o.occurred_on <= ?';
            $params[] = $this->date($filters['to']);
        }
        $sql .= ' ORDER BY o.occurred_on DESC, o.id DESC LIMIT ' . $this->limit($filters['limit'] ?? 50);
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $items = [];
        $income = 0;
        $expense = 0;
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $item = $this->present($row);
            $items[] = $item;
            if ($item['kind'] === 'income') {
                $income += $item['amount'];
            } else {
                $expense += $item['amount'];
            }
        }

        return [
            'currency' => 'KZT',
            'timezone' => 'Asia/Almaty',
            'income' => $income,
            'expense' => $expense,
            'items' => $items,
        ];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function create(array $user, array $input): array
    {
        $this->allow($user);
        $kind = (string) ($input['kind'] ?? '');
        if (!in_array($kind, ['income', 'expense'], true)) {
            throw new AppException('kind: income (приход) или expense (расход)', 422);
        }
        $amount = $input['amount'] ?? null;
        if (!is_int($amount) || $amount <= 0 || $amount > 2000000000) {
            throw new AppException('Сумма — целое число тенге больше нуля', 422);
        }
        $date = array_key_exists('occurred_on', $input) && $input['occurred_on'] !== null && $input['occurred_on'] !== ''
            ? $this->date($input['occurred_on'])
            : date('Y-m-d');
        $clientId = null;
        if (!empty($input['client_id'])) {
            if (!is_int($input['client_id']) || $input['client_id'] <= 0) {
                throw new AppException('client_id должен быть числом', 422);
            }
            $stmt = Database::pdo()->prepare('SELECT id FROM clients WHERE id = ?');
            $stmt->execute([$input['client_id']]);
            if (!(int) $stmt->fetchColumn()) {
                throw new AppException('Клиент не найден', 422);
            }
            $clientId = $input['client_id'];
        }
        $comment = null;
        if (isset($input['comment']) && trim((string) $input['comment']) !== '') {
            $comment = mb_substr(trim((string) $input['comment']), 0, 255);
        }
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO cash_operations (kind, amount, occurred_on, comment, client_id, created_by)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([$kind, $amount, $date, $comment, $clientId, (int) $user['user_id']]);
        $id = (int) $pdo->lastInsertId();
        $this->audit->log((int) $user['user_id'], 'cash', (string) $id, 'create', null, [
            'kind' => $kind,
            'amount' => $amount,
        ]);

        return $this->fetch($id);
    }

    /** @param array<string, mixed> $user */
    private function allow(array $user): void
    {
        if (!$this->policy->can($user, 'reports', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @return array<string, mixed> */
    private function fetch(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT o.id, o.kind, o.amount, o.occurred_on, o.comment, o.client_id, o.created_by, o.created_at,
                    c.name AS client_name, u.name AS author_name
             FROM cash_operations o
             JOIN users u ON u.id = o.created_by
             LEFT JOIN clients c ON c.id = o.client_id
             WHERE o.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Операция не найдена', 404);
        }

        return $this->present($row);
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function present(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'kind' => (string) $row['kind'],
            'amount' => (int) $row['amount'],
            'currency' => 'KZT',
            'occurred_on' => (string) $row['occurred_on'],
            'comment' => $row['comment'] !== null ? (string) $row['comment'] : null,
            'client_id' => $row['client_id'] !== null ? (int) $row['client_id'] : null,
            'client_name' => $row['client_name'] !== null ? (string) $row['client_name'] : null,
            'created_by' => (int) $row['created_by'],
            'author_name' => (string) $row['author_name'],
            'created_at' => (string) $row['created_at'],
        ];
    }

    private function date(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}/', $value)) {
            throw new AppException('Дата в формате YYYY-MM-DD', 422);
        }
        $ts = strtotime(substr($value, 0, 10));
        if ($ts === false) {
            throw new AppException('Неверная дата', 422);
        }

        return date('Y-m-d', $ts);
    }

    private function limit(mixed $value): int
    {
        $limit = is_int($value) ? $value : (int) $value;

        return min(100, max(1, $limit > 0 ? $limit : 50));
    }
}
