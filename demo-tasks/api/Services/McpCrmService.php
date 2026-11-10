<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\Phone;
use Trx\Security\Policy;

/**
 * Clients, deals and the employee directory used by MCP tools.
 * Deletes affect one row identified by an integer id.
 */
final class McpCrmService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
        private readonly CrmService $crm = new CrmService(),
    ) {
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function listClients(array $user, array $filters): array
    {
        $this->sales($user);
        $sql = 'SELECT id, name, company, phone, language, created_at FROM clients WHERE 1 = 1';
        $params = [];
        if (!empty($filters['q']) && is_string($filters['q'])) {
            $sql .= ' AND (name LIKE ? OR company LIKE ? OR phone LIKE ?)';
            $q = '%' . $filters['q'] . '%';
            $params = [$q, $q, $q];
        }
        $sql .= ' ORDER BY id DESC LIMIT ' . $this->limit($filters['limit'] ?? 50);
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        return ['items' => array_map(fn (array $row): array => $this->client($row), $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [])];
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function createClient(array $user, array $input): array
    {
        $this->sales($user);
        $name = $this->name($input['name'] ?? '');
        $phone = Phone::normalize((string) ($input['phone'] ?? ''));
        $company = $this->optionalText($input['company'] ?? null, 190);
        $language = $this->language($input['language'] ?? 'ru');
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO clients (name, company, phone, language, owner_id) VALUES (?, ?, ?, ?, ?)'
        )->execute([$name, $company, $phone, $language, (int) $user['user_id']]);
        $id = (int) $pdo->lastInsertId();
        $this->audit->log((int) $user['user_id'], 'client', (string) $id, 'create', null, ['name' => $name]);

        return $this->clientById($id);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function updateClient(array $user, array $input): array
    {
        $this->sales($user);
        $id = $this->intId($input);
        $current = $this->clientById($id);
        $changes = [];
        if (array_key_exists('name', $input)) {
            $changes['name'] = $this->name($input['name']);
        }
        if (array_key_exists('phone', $input)) {
            $changes['phone'] = Phone::normalize((string) $input['phone']);
        }
        if (array_key_exists('company', $input)) {
            $changes['company'] = $this->optionalText($input['company'], 190);
        }
        if (array_key_exists('language', $input)) {
            $changes['language'] = $this->language($input['language']);
        }
        if ($changes === []) {
            return $current;
        }
        $sets = implode(', ', array_map(static fn (string $field): string => "{$field} = ?", array_keys($changes)));
        Database::pdo()->prepare("UPDATE clients SET {$sets} WHERE id = ?")->execute([...array_values($changes), $id]);
        $this->audit->log((int) $user['user_id'], 'client', (string) $id, 'update', null, $changes);

        return $this->clientById($id);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function deleteClient(array $user, array $input): array
    {
        $this->sales($user);
        $id = $this->exactId($input);
        $current = $this->clientById($id);
        $deals = Database::pdo()->prepare('SELECT COUNT(*) FROM deals WHERE client_id = ?');
        $deals->execute([$id]);
        if ((int) $deals->fetchColumn() > 0) {
            throw new AppException('У клиента есть сделки, удаление отменено', 422);
        }
        Database::pdo()->prepare('DELETE FROM clients WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'client', (string) $id, 'delete', ['name' => $current['name']], null);

        return ['deleted' => true, 'id' => $id];
    }

    /** @param array<string, mixed> $user @return array<string, mixed> */
    public function stages(array $user): array
    {
        $this->sales($user);
        $rows = Database::pdo()->query(
            'SELECT id, slug, name, sort_order, is_won, is_lost FROM pipeline_stages WHERE pipeline_id = 1 ORDER BY sort_order'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $items = [];
        foreach ($rows as $row) {
            $items[] = [
                'id' => (int) $row['id'],
                'slug' => (string) $row['slug'],
                'name' => (string) $row['name'],
                'sort_order' => (int) $row['sort_order'],
                'is_won' => (int) $row['is_won'] === 1,
                'is_lost' => (int) $row['is_lost'] === 1,
            ];
        }

        return ['items' => $items];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $filters
     * @return array<string, mixed>
     */
    public function listDeals(array $user, array $filters): array
    {
        $this->sales($user);
        $sql = 'SELECT d.id, d.number, d.title, d.client_id, c.name AS client_name, d.stage_id, s.slug AS stage_slug,
                       s.name AS stage_name, d.amount, d.owner_id, u.name AS owner_name, d.source, d.channel,
                       d.next_contact_at, d.created_at
                FROM deals d
                JOIN clients c ON c.id = d.client_id
                JOIN pipeline_stages s ON s.id = d.stage_id
                JOIN users u ON u.id = d.owner_id
                WHERE 1 = 1';
        $params = [];
        if (!empty($filters['stage']) && is_string($filters['stage'])) {
            $sql .= ' AND s.slug = ?';
            $params[] = $filters['stage'];
        }
        if (!empty($filters['client_id']) && is_int($filters['client_id'])) {
            $sql .= ' AND d.client_id = ?';
            $params[] = $filters['client_id'];
        }
        if (!empty($filters['q']) && is_string($filters['q'])) {
            $sql .= ' AND (d.title LIKE ? OR d.number LIKE ? OR c.name LIKE ?)';
            $q = '%' . $filters['q'] . '%';
            array_push($params, $q, $q, $q);
        }
        $sql .= ' ORDER BY d.id DESC LIMIT ' . $this->limit($filters['limit'] ?? 50);
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);
        $items = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) ?: [] as $row) {
            $items[] = $this->deal($row);
        }

        return ['currency' => 'KZT', 'timezone' => 'Asia/Almaty', 'items' => $items];
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function createDeal(array $user, array $input): array
    {
        $this->sales($user);
        $title = $this->name($input['title'] ?? '', 'Укажите название сделки');
        $clientId = $this->resolveClient($user, $input);
        $ownerId = $this->ownerId($input['owner_id'] ?? null, (int) $user['user_id']);
        $stage = is_string($input['stage'] ?? null) && $input['stage'] !== '' ? (string) $input['stage'] : 'new_lead';
        $stageId = $this->stageId($stage);
        $amount = $this->money($input['amount'] ?? 0, true);
        $source = $this->optionalText($input['source'] ?? 'grok', 64) ?? 'grok';
        $channel = $this->optionalText($input['channel'] ?? 'offline', 32) ?? 'offline';
        $pdo = Database::pdo();
        $number = 'DL-' . date('ymd') . '-' . random_int(1000, 9999);
        $pdo->prepare(
            'INSERT INTO deals (number, title, client_id, pipeline_id, stage_id, channel, source, owner_id, amount)
             VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)'
        )->execute([$number, $title, $clientId, $stageId, $channel, $source, $ownerId, $amount]);
        $id = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT IGNORE INTO deal_stage_entries (deal_id, stage_id) VALUES (?, ?)')->execute([$id, $stageId]);
        $this->audit->log((int) $user['user_id'], 'deal', (string) $id, 'create', null, ['number' => $number, 'title' => $title]);

        return $this->dealById($id);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function updateDeal(array $user, array $input): array
    {
        $this->sales($user);
        $id = $this->intId($input);
        $current = $this->dealById($id);
        if (!empty($input['stage']) && is_string($input['stage']) && $input['stage'] !== $current['stage_slug']) {
            $this->crm->move($user, $id, $input['stage'], $input);
        }
        $changes = [];
        if (array_key_exists('title', $input)) {
            $changes['title'] = $this->name($input['title'], 'Укажите название сделки');
        }
        if (array_key_exists('amount', $input)) {
            $changes['amount'] = $this->money($input['amount'], true);
        }
        if (array_key_exists('owner_id', $input)) {
            $changes['owner_id'] = $this->ownerId($input['owner_id'], 0);
        }
        if (array_key_exists('source', $input)) {
            $changes['source'] = $this->optionalText($input['source'], 64) ?? '';
        }
        if ($changes !== []) {
            $sets = implode(', ', array_map(static fn (string $field): string => "{$field} = ?", array_keys($changes)));
            Database::pdo()->prepare("UPDATE deals SET {$sets}, last_activity_at = NOW() WHERE id = ?")->execute([...array_values($changes), $id]);
            $this->audit->log((int) $user['user_id'], 'deal', (string) $id, 'update', null, $changes);
        }

        return $this->dealById($id);
    }

    /** @param array<string, mixed> $user @param array<string, mixed> $input @return array<string, mixed> */
    public function deleteDeal(array $user, array $input): array
    {
        $this->sales($user);
        $id = $this->exactId($input);
        $current = $this->dealById($id);
        $pdo = Database::pdo();
        $block = $pdo->prepare(
            'SELECT (SELECT COUNT(*) FROM orders WHERE deal_id = ?) AS orders,
                    (SELECT COUNT(*) FROM payments WHERE deal_id = ?) AS payments'
        );
        $block->execute([$id, $id]);
        $counts = $block->fetch(PDO::FETCH_ASSOC) ?: ['orders' => 0, 'payments' => 0];
        if ((int) $counts['orders'] > 0 || (int) $counts['payments'] > 0) {
            throw new AppException('У сделки есть заказы или оплаты, удаление отменено', 422);
        }
        $pdo->prepare('UPDATE tasks SET deal_id = NULL WHERE deal_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM deals WHERE id = ?')->execute([$id]);
        $this->audit->log((int) $user['user_id'], 'deal', (string) $id, 'delete', ['number' => $current['number']], null);

        return ['deleted' => true, 'id' => $id];
    }

    /** @param array<string, mixed> $user @return array<string, mixed> */
    public function contacts(array $user): array
    {
        if (!$this->policy->can($user, 'team', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
        $rows = Database::pdo()->query(
            'SELECT u.id, u.name, u.phone, u.initials FROM users u
             WHERE u.is_active = 1 AND u.deleted_at IS NULL'
            . (\Trx\Security\Policy::isSuperadmin($user) ? '' : ' AND ' . \Trx\Security\Policy::hideSuperadminSql('u')) . '
             ORDER BY u.name'
        )->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $items = [];
        foreach ($rows as $row) {
            $items[] = [
                'id' => (int) $row['id'],
                'name' => (string) $row['name'],
                'phone' => $row['phone'] !== null ? (string) $row['phone'] : '',
                'initials' => (string) $row['initials'],
            ];
        }

        return ['items' => $items];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     * @return array<string, mixed>
     */
    public function logOutgoing(array $user, array $input): array
    {
        if (!$this->policy->can($user, 'agent', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
        $contactId = $input['contactId'] ?? $input['contact_id'] ?? null;
        if (!is_int($contactId) || $contactId <= 0) {
            throw new AppException('Укажите contactId сотрудника', 422);
        }
        $channel = trim((string) ($input['channel'] ?? ''));
        $text = trim((string) ($input['text'] ?? ''));
        $status = trim((string) ($input['status'] ?? ''));
        if ($channel === '' || mb_strlen($channel) > 32 || $text === '' || mb_strlen($text) > 4000 || $status === '' || mb_strlen($status) > 32) {
            throw new AppException('Нужны channel, text и status', 422);
        }
        $stmt = Database::pdo()->prepare('SELECT id FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$contactId]);
        if (!(int) $stmt->fetchColumn()) {
            throw new AppException('Контакт не найден', 404);
        }
        $pdo = Database::pdo();
        $pdo->prepare(
            'INSERT INTO outgoing_message_log (contact_id, channel, body, status, logged_by) VALUES (?, ?, ?, ?, ?)'
        )->execute([$contactId, $channel, $text, $status, (int) $user['user_id']]);

        return [
            'id' => (int) $pdo->lastInsertId(),
            'contactId' => $contactId,
            'channel' => $channel,
            'status' => $status,
        ];
    }

    /** @param array<string, mixed> $user */
    private function sales(array $user): void
    {
        if (!$this->policy->can($user, 'sales', 'view')) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @param array<string, mixed> $input */
    private function resolveClient(array $user, array $input): int
    {
        if (isset($input['client_id']) && $input['client_id'] !== null && $input['client_id'] !== '') {
            if (!is_int($input['client_id']) || $input['client_id'] <= 0) {
                throw new AppException('client_id должен быть числом', 422);
            }
            $stmt = Database::pdo()->prepare('SELECT id FROM clients WHERE id = ?');
            $stmt->execute([$input['client_id']]);
            if (!(int) $stmt->fetchColumn()) {
                throw new AppException('Клиент не найден', 422);
            }

            return $input['client_id'];
        }
        $name = trim((string) ($input['client_name'] ?? ''));
        if ($name === '') {
            throw new AppException('Укажите client_id или client_name', 422);
        }

        return (int) $this->createClient($user, [
            'name' => $name,
            'phone' => (string) ($input['phone'] ?? ''),
            'company' => $input['company'] ?? null,
        ])['id'];
    }

    private function ownerId(mixed $value, int $fallback): int
    {
        $id = is_int($value) && $value > 0 ? $value : $fallback;
        if ($id <= 0) {
            throw new AppException('Укажите владельца сделки', 422);
        }
        $stmt = Database::pdo()->prepare('SELECT id FROM users WHERE id = ? AND is_active = 1');
        $stmt->execute([$id]);
        if (!(int) $stmt->fetchColumn()) {
            throw new AppException('Сотрудник не найден', 422);
        }

        return $id;
    }

    private function stageId(string $slug): int
    {
        $stmt = Database::pdo()->prepare('SELECT id FROM pipeline_stages WHERE pipeline_id = 1 AND slug = ?');
        $stmt->execute([$slug]);
        $id = (int) $stmt->fetchColumn();
        if ($id <= 0) {
            throw new AppException('Неизвестный этап воронки', 422);
        }

        return $id;
    }

    private function money(mixed $value, bool $allowZero): int
    {
        if (!is_int($value) || $value < 0 || $value > 2000000000 || (!$allowZero && $value === 0)) {
            throw new AppException('Сумма — целое число тенге', 422);
        }

        return $value;
    }

    /** @param array<string, mixed> $input */
    private function exactId(array $input): int
    {
        if (array_keys($input) !== ['id']) {
            throw new AppException('Удаление только по точному id', 422);
        }

        return $this->intId($input);
    }

    /** @param array<string, mixed> $input */
    private function intId(array $input): int
    {
        $id = $input['id'] ?? null;
        if (!is_int($id) || $id <= 0) {
            throw new AppException('Укажите точный id', 422);
        }

        return $id;
    }

    /** @return array<string, mixed> */
    private function clientById(int $id): array
    {
        $stmt = Database::pdo()->prepare('SELECT id, name, company, phone, language, created_at FROM clients WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Клиент не найден', 404);
        }

        return $this->client($row);
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function client(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'company' => $row['company'] !== null ? (string) $row['company'] : null,
            'phone' => (string) $row['phone'],
            'language' => (string) $row['language'],
            'created_at' => (string) $row['created_at'],
        ];
    }

    /** @return array<string, mixed> */
    private function dealById(int $id): array
    {
        $stmt = Database::pdo()->prepare(
            'SELECT d.id, d.number, d.title, d.client_id, c.name AS client_name, d.stage_id, s.slug AS stage_slug,
                    s.name AS stage_name, d.amount, d.owner_id, u.name AS owner_name, d.source, d.channel,
                    d.next_contact_at, d.created_at
             FROM deals d
             JOIN clients c ON c.id = d.client_id
             JOIN pipeline_stages s ON s.id = d.stage_id
             JOIN users u ON u.id = d.owner_id
             WHERE d.id = ?'
        );
        $stmt->execute([$id]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new AppException('Сделка не найдена', 404);
        }

        return $this->deal($row);
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function deal(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'number' => (string) $row['number'],
            'title' => (string) $row['title'],
            'client_id' => (int) $row['client_id'],
            'client_name' => (string) $row['client_name'],
            'stage_slug' => (string) $row['stage_slug'],
            'stage_name' => (string) $row['stage_name'],
            'amount' => (int) $row['amount'],
            'currency' => 'KZT',
            'owner_id' => (int) $row['owner_id'],
            'owner_name' => (string) $row['owner_name'],
            'source' => (string) $row['source'],
            'channel' => (string) $row['channel'],
            'next_contact_at' => $row['next_contact_at'] !== null ? (string) $row['next_contact_at'] : null,
            'created_at' => (string) $row['created_at'],
            'timezone' => 'Asia/Almaty',
        ];
    }

    private function name(mixed $value, string $error = 'Укажите имя'): string
    {
        $name = trim(is_string($value) ? $value : '');
        if ($name === '' || mb_strlen($name) > 190) {
            throw new AppException($error, 422);
        }

        return $name;
    }

    private function optionalText(mixed $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) $value);

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    private function language(mixed $value): string
    {
        $language = is_string($value) && $value !== '' ? $value : 'ru';
        if (!in_array($language, ['ru', 'kk', 'en'], true)) {
            throw new AppException('Язык: ru, kk или en', 422);
        }

        return $language;
    }

    private function limit(mixed $value): int
    {
        $limit = is_int($value) ? $value : (int) $value;

        return min(100, max(1, $limit > 0 ? $limit : 50));
    }
}
