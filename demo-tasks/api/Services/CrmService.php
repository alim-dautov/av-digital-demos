<?php

declare(strict_types=1);

namespace Trx\Services;

use PDO;
use Trx\Database;
use Trx\Domain\BotEngine;
use Trx\Domain\BusinessCalendar;
use Trx\Domain\CallIngest;
use Trx\Domain\DuplicatePolicy;
use Trx\Domain\KpiMath;
use Trx\Domain\ManagerScore;
use Trx\Domain\OrderPush;
use Trx\Domain\PaymentGuard;
use Trx\Domain\Phone;
use Trx\Domain\PipelineRules;
use Trx\Domain\QuoteMath;
use Trx\Domain\StockFreshness;
use Trx\Security\Policy;

final class CrmService
{
    public function __construct(
        private readonly Policy $policy = new Policy(),
        private readonly AuditService $audit = new AuditService(),
        private readonly TaskService $taskService = new TaskService(),
    ) {
    }

    /** @param array<string, mixed> $user */
    public function board(array $user, array $filters): array
    {
        $this->need($user, 'sales', 'view');
        [$sql, $params] = $this->dealSql($user);
        if (!empty($filters['channel'])) {
            $sql .= ' AND d.channel = ?';
            $params[] = $filters['channel'];
        }
        if (!empty($filters['owner_id'])) {
            $sql .= ' AND d.owner_id = ?';
            $params[] = (int) $filters['owner_id'];
        }
        if (!empty($filters['source'])) {
            $sql .= ' AND d.source = ?';
            $params[] = $filters['source'];
        }
        $sql .= ' ORDER BY d.updated_at DESC LIMIT 400';
        $rows = $this->all($sql, $params);
        $stages = $this->all('SELECT id, slug, name, sort_order, is_won, is_lost FROM pipeline_stages WHERE pipeline_id = 1 ORDER BY sort_order', []);
        $columns = [];
        foreach ($stages as $stage) {
            $columns[$stage['slug']] = [
                'id' => (int) $stage['id'],
                'slug' => $stage['slug'],
                'name' => $stage['name'],
                'count' => 0,
                'amount' => 0,
                'deals' => [],
            ];
        }
        foreach ($rows as $row) {
            $slug = (string) $row['stage_slug'];
            if (!isset($columns[$slug])) {
                continue;
            }
            $card = $this->dealCard($row);
            $columns[$slug]['deals'][] = $card;
            $columns[$slug]['count']++;
            $columns[$slug]['amount'] += (int) $row['amount'];
        }

        return [
            'mode' => 'crm',
            'columns' => array_values($columns),
            'updated_at' => date('c'),
        ];
    }

    /** @param array<string, mixed> $user */
    public function showDeal(array $user, int $id): array
    {
        $this->need($user, 'sales', 'view');
        $row = $this->oneDeal($user, $id);
        $items = $this->all('SELECT * FROM deal_items WHERE deal_id = ?', [$id]);
        $events = $this->all(
            'SELECT kind, body, created_at FROM deal_events WHERE deal_id = ? ORDER BY id DESC LIMIT 80',
            [$id]
        );
        $quotes = $this->all('SELECT id, number, version, status, total, sent_at, sent_via, needs_approval FROM quotes WHERE deal_id = ? ORDER BY version', [$id]);
        $orders = $this->all('SELECT id, number, status, amount, paid_amount, onec_document_id, delivery_status FROM orders WHERE deal_id = ?', [$id]);
        $calls = $this->policy->can($user, 'calls', 'view')
            ? $this->all('SELECT id, external_id, direction, result, duration_sec, started_at FROM calls WHERE deal_id = ?', [$id])
            : [];

        return [
            'deal' => $this->dealCard($row),
            'items' => $items,
            'timeline' => $events,
            'quotes' => $quotes,
            'orders' => $orders,
            'calls' => $calls,
        ];
    }

    /**
     * @param array<string, mixed> $user
     * @param array<string, mixed> $input
     */
    public function ingestLead(array $user, array $input): array
    {
        $this->need($user, 'sales', 'update');
        $phone = Phone::normalize((string) ($input['phone'] ?? ''));
        $name = trim((string) ($input['name'] ?? ''));
        $source = trim((string) ($input['source'] ?? ''));
        if ($name === '' || $source === '') {
            throw new AppException('Нужны имя и источник');
        }
        $eventId = trim((string) ($input['event_id'] ?? ''));
        $newPurchase = !empty($input['new_purchase']);
        $open = $this->openDeals($phone);
        $decision = DuplicatePolicy::resolve($open, $phone, $eventId !== '' ? $eventId : null, $newPurchase);
        if ($decision['action'] === 'link') {
            $dealId = (int) $decision['deal_id'];
            $this->addEvent($dealId, $eventId !== '' ? $eventId : null, 'message', 'Повтор обращения связан с открытой сделкой', (int) $user['user_id']);
            $this->audit->log((int) $user['user_id'], 'deal', (string) $dealId, 'link_duplicate', null, $decision);

            return ['linked' => true, 'deal_id' => $dealId, 'reason' => $decision['reason']];
        }
        $pdo = Database::pdo();
        $clientId = $this->clientId($name, $phone, (int) ($input['owner_id'] ?? 0));
        $ownerId = $this->assignOwner($input);
        $stageId = (int) $this->stageId('new_lead');
        $now = new \DateTimeImmutable('now', new \DateTimeZone('Asia/Almaty'));
        $cal = $this->calendar();
        $sla = $cal->isOpen($now) ? $now->modify('+5 minutes') : $cal->nextOpen($now);
        $number = 'DL-' . date('ymd') . '-' . random_int(100, 999);
        $pdo->prepare(
            'INSERT INTO deals (number, title, client_id, pipeline_id, stage_id, channel, source, utm_source, owner_id, amount, next_contact_at, sla_due_at, is_test, is_demo)
             VALUES (?,?,?,1,?,?,?,?,?,0,?,?,?,?)'
        )->execute([
            $number,
            trim((string) ($input['title'] ?? ('Заявка ' . $name))),
            $clientId,
            $stageId,
            (string) ($input['channel'] ?? 'whatsapp'),
            $source,
            $input['utm_source'] ?? null,
            $ownerId,
            $sla->format('Y-m-d H:i:s'),
            $sla->format('Y-m-d H:i:s'),
            !empty($input['is_test']) ? 1 : 0,
            !empty($input['is_demo']) ? 1 : 0,
        ]);
        $dealId = (int) $pdo->lastInsertId();
        $pdo->prepare('INSERT INTO deal_stage_entries (deal_id, stage_id) VALUES (?,?)')->execute([$dealId, $stageId]);
        if ($eventId !== '') {
            $this->addEvent($dealId, $eventId, 'lead', 'Создана заявка', (int) $user['user_id']);
        } else {
            $this->addEvent($dealId, null, 'lead', 'Создана заявка', (int) $user['user_id']);
        }
        $this->taskService->create($user, [
            'title' => 'Следующий контакт: ' . $name,
            'assignee_id' => $ownerId,
            'department_id' => $this->deptId('sales'),
            'due_at' => $sla->format('Y-m-d H:i:s'),
            'deal_id' => $dealId,
            'client_id' => $clientId,
            'priority' => 'high',
        ]);
        $this->audit->log((int) $user['user_id'], 'deal', (string) $dealId, 'create', null, ['number' => $number]);

        return ['linked' => false, 'deal_id' => $dealId, 'number' => $number];
    }

    /** @param array<string, mixed> $user */
    public function move(array $user, int $id, string $stage, array $input): array
    {
        $this->need($user, 'sales', 'update');
        $row = $this->oneDeal($user, $id);
        $snapshot = $this->snapshot($row, $input);
        $check = PipelineRules::canEnter($stage, $snapshot);
        if (!$check['ok']) {
            throw new AppException('Не хватает данных: ' . implode(', ', $check['missing']));
        }
        $stageId = $this->stageId($stage);
        $pdo = Database::pdo();
        $pdo->prepare('UPDATE deals SET stage_id = ?, loss_reason = COALESCE(?, loss_reason), objection = COALESCE(?, objection), next_contact_at = COALESCE(?, next_contact_at), client_replied = IF(? = 1, 1, client_replied), client_task = COALESCE(?, client_task), product_interest = COALESCE(?, product_interest), requirements = COALESCE(?, requirements), payment_terms = COALESCE(?, payment_terms), last_activity_at = NOW() WHERE id = ?')->execute([
            $stageId,
            $input['loss_reason'] ?? null,
            $input['objection'] ?? null,
            $input['next_contact_at'] ?? null,
            !empty($input['client_replied']) ? 1 : 0,
            $input['client_task'] ?? null,
            $input['product'] ?? null,
            $input['requirements'] ?? null,
            $input['payment_terms'] ?? null,
            $id,
        ]);
        $pdo->prepare('INSERT IGNORE INTO deal_stage_entries (deal_id, stage_id) VALUES (?,?)')->execute([$id, $stageId]);
        $this->addEvent($id, null, 'stage', 'Этап: ' . $stage, (int) $user['user_id']);
        $this->audit->log((int) $user['user_id'], 'deal', (string) $id, 'stage', ['stage' => $row['stage_slug']], ['stage' => $stage]);
        if (!in_array($stage, ['won', 'lost'], true)) {
            $openTask = (int) $pdo->query('SELECT COUNT(*) FROM tasks WHERE deal_id = ' . (int) $id . " AND status NOT IN ('done','cancelled')")->fetchColumn();
            if ($openTask === 0) {
                $this->taskService->create($user, [
                    'title' => 'Следующее действие по ' . $row['number'],
                    'assignee_id' => (int) $row['owner_id'],
                    'department_id' => $this->deptId('sales'),
                    'due_at' => $input['next_contact_at'] ?? date('Y-m-d H:i:s', time() + 86400),
                    'deal_id' => $id,
                    'priority' => 'medium',
                ]);
            }
        }

        return $this->showDeal($user, $id);
    }

    /** @param array<string, mixed> $user */
    public function addItem(array $user, int $dealId, array $input): array
    {
        $this->need($user, 'sales', 'update');
        $this->oneDeal($user, $dealId);
        $sku = trim((string) ($input['sku'] ?? ''));
        $qty = (int) ($input['qty'] ?? 1);
        $price = (int) ($input['price'] ?? 0);
        $discount = (float) ($input['discount_pct'] ?? 0);
        if ($sku === '' || $qty < 1) {
            throw new AppException('Нужны артикул и количество');
        }
        $product = $this->first('SELECT * FROM products WHERE sku = ?', [$sku]);
        $min = $product ? (int) $product['min_price'] : 0;
        $canOverride = (string) $user['role_slug'] === 'owner';
        if ($product && !QuoteMath::priceAllowed($price, $min, $canOverride)) {
            throw new AppException('Цена ниже минимальной из каталога');
        }
        $name = $product['name'] ?? trim((string) ($input['name'] ?? $sku));
        $line = QuoteMath::lineTotal($qty, $price, $discount);
        Database::pdo()->prepare(
            'INSERT INTO deal_items (deal_id, product_id, sku, name, qty, unit, price, discount_pct, line_total) VALUES (?,?,?,?,?,?,?,?,?)'
        )->execute([
            $dealId,
            $product['id'] ?? null,
            $sku,
            $name,
            $qty,
            $product['unit'] ?? 'шт',
            $price,
            $discount,
            $line,
        ]);
        $this->refreshAmount($dealId);

        return $this->showDeal($user, $dealId);
    }

    /** @param array<string, mixed> $user */
    public function createQuote(array $user, int $dealId): array
    {
        $this->need($user, 'sales', 'update');
        $deal = $this->oneDeal($user, $dealId);
        $items = $this->all('SELECT sku, name, qty, unit, price, discount_pct, line_total FROM deal_items WHERE deal_id = ?', [$dealId]);
        if ($items === []) {
            throw new AppException('В сделке нет товаров');
        }
        $warning = $this->stockWarning();
        $maxDiscount = 0.0;
        $lines = [];
        foreach ($items as $item) {
            $maxDiscount = max($maxDiscount, (float) $item['discount_pct']);
            $lines[] = [
                'qty' => (int) $item['qty'],
                'price' => (int) $item['price'],
                'discount_pct' => (float) $item['discount_pct'],
            ];
        }
        $threshold = (float) $this->setting('discount_threshold', 10);
        $needs = QuoteMath::needsApproval($maxDiscount, $threshold);
        if ($needs && (string) $user['role_slug'] !== 'owner') {
            $status = 'pending_approval';
        } else {
            $status = 'prepared';
            $needs = false;
        }
        $version = (int) $this->first('SELECT COALESCE(MAX(version),0) v FROM quotes WHERE deal_id = ?', [$dealId])['v'] + 1;
        $total = QuoteMath::total($lines);
        $number = $deal['number'] . '-КП-' . $version;
        $snapshot = [
            'template' => 'stub',
            'notice' => 'Реквизиты, логотип и условия не переданы заказчиком. Это шаблон, не счёт.',
            'seller' => 'DEMO — реквизиты не заполнены',
            'client' => $deal['client_name'],
            'manager' => Policy::personName((string) $deal['owner_name'], $deal['owner_deleted_at'] ?? null),
            'items' => $items,
            'total' => $total,
            'stock_warning' => $warning,
            'valid_until' => date('Y-m-d', strtotime('+7 days')),
        ];
        Database::pdo()->prepare(
            'INSERT INTO quotes (deal_id, number, version, status, valid_until, discount_pct, total, snapshot, needs_approval, author_id)
             VALUES (?,?,?,?,?,?,?,?,?,?)'
        )->execute([
            $dealId,
            $number,
            $version,
            $status,
            $snapshot['valid_until'],
            $maxDiscount,
            $total,
            json_encode($snapshot, JSON_UNESCAPED_UNICODE),
            $needs ? 1 : 0,
            (int) $user['user_id'],
        ]);
        $id = (int) Database::pdo()->lastInsertId();
        $this->audit->log((int) $user['user_id'], 'quote', (string) $id, 'create', null, ['total' => $total, 'status' => $status]);

        return ['id' => $id, 'number' => $number, 'status' => $status, 'total' => $total, 'stock_warning' => $warning, 'html' => $this->quoteHtml($snapshot, $number)];
    }

    /** @param array<string, mixed> $user */
    public function sendQuote(array $user, int $quoteId, string $via): array
    {
        $this->need($user, 'sales', 'update');
        $quote = $this->first('SELECT * FROM quotes WHERE id = ?', [$quoteId]);
        if (!$quote) {
            throw new AppException('КП не найдено', 404);
        }
        $this->oneDeal($user, (int) $quote['deal_id']);
        if ((int) $quote['needs_approval'] === 1 && (string) $user['role_slug'] !== 'owner') {
            throw new AppException('Скидка выше порога ждёт согласования');
        }
        if (!in_array($via, ['download', 'manual', 'channel'], true)) {
            throw new AppException('Укажите способ отправки');
        }
        Database::pdo()->prepare("UPDATE quotes SET status = 'sent', sent_at = NOW(), sent_via = ?, needs_approval = 0 WHERE id = ?")->execute([$via, $quoteId]);
        $deal = $this->oneDeal($user, (int) $quote['deal_id']);
        $this->taskService->create($user, [
            'title' => 'Следующий контакт после КП ' . $quote['number'],
            'assignee_id' => (int) $deal['owner_id'],
            'department_id' => $this->deptId('sales'),
            'due_at' => date('Y-m-d H:i:s', time() + 86400),
            'deal_id' => (int) $quote['deal_id'],
            'priority' => 'high',
        ]);
        $this->addEvent((int) $quote['deal_id'], null, 'quote', 'КП отправлено: ' . $via, (int) $user['user_id']);
        $this->audit->log((int) $user['user_id'], 'quote', (string) $quoteId, 'send', null, ['via' => $via]);

        return ['id' => $quoteId, 'status' => 'sent', 'via' => $via];
    }

    /** @param array<string, mixed> $user */
    public function quoteHtmlById(array $user, int $quoteId): string
    {
        $this->need($user, 'sales', 'view');
        $quote = $this->first('SELECT * FROM quotes WHERE id = ?', [$quoteId]);
        if (!$quote) {
            throw new AppException('КП не найдено', 404);
        }
        $this->oneDeal($user, (int) $quote['deal_id']);
        $snapshot = json_decode((string) $quote['snapshot'], true) ?: [];

        return $this->quoteHtml($snapshot, (string) $quote['number']);
    }

    /** @param array<string, mixed> $user */
    public function pushOrder(array $user, int $dealId, string $idempotencyKey): array
    {
        $this->need($user, 'sales', 'update');
        $deal = $this->oneDeal($user, $dealId);
        if ($idempotencyKey === '' || strlen($idempotencyKey) < 8) {
            throw new AppException('Нужен ключ идемпотентности');
        }
        $existing = $this->first('SELECT * FROM orders WHERE idempotency_key = ?', [$idempotencyKey]);
        if ($existing) {
            $doc = OrderPush::documentId($idempotencyKey, (string) $existing['onec_document_id']);

            return [
                'created' => false,
                'order_id' => (int) $existing['id'],
                'document_id' => $doc['document_id'],
                'mode' => 'test',
            ];
        }
        $doc = OrderPush::documentId($idempotencyKey, null);
        $number = 'ORD-' . date('ymd') . '-' . random_int(100, 999);
        Database::pdo()->prepare(
            'INSERT INTO orders (deal_id, number, status, amount, onec_document_id, idempotency_key) VALUES (?,?,\'draft\',?,?,?)'
        )->execute([$dealId, $number, (int) $deal['amount'], $doc['document_id'], $idempotencyKey]);
        $orderId = (int) Database::pdo()->lastInsertId();
        $this->addEvent($dealId, 'onec-' . $idempotencyKey, 'onec', 'Тестовый заказ 1С ' . $doc['document_id'], (int) $user['user_id']);
        $this->audit->log((int) $user['user_id'], 'order', (string) $orderId, 'push_onec', null, ['document_id' => $doc['document_id'], 'mode' => 'test']);

        return ['created' => true, 'order_id' => $orderId, 'document_id' => $doc['document_id'], 'mode' => 'test'];
    }

    /** @param array<string, mixed> $user */
    public function applyOneCPayment(array $user, string $documentId, int $amount, string $kind, string $idempotencyKey): array
    {
        $this->need($user, 'sales', 'update');
        if (!in_array($kind, ['payment', 'refund'], true) || $amount <= 0) {
            throw new AppException('Нужны сумма и тип payment или refund');
        }
        $existing = $this->first('SELECT id FROM payments WHERE idempotency_key = ?', [$idempotencyKey]);
        if ($existing) {
            return ['created' => false, 'payment_id' => (int) $existing['id'], 'mode' => 'test'];
        }
        $order = $this->first('SELECT * FROM orders WHERE onec_document_id = ?', [$documentId]);
        if (!$order) {
            throw new AppException('Заказ 1С не найден', 404);
        }
        Database::pdo()->prepare(
            'INSERT INTO payments (order_id, deal_id, amount, kind, source, paid_on, onec_document_id, idempotency_key, confirmed_by) VALUES (?,?,?,?,\'onec\',CURDATE(),?,?,?)'
        )->execute([(int) $order['id'], (int) $order['deal_id'], $amount, $kind, $documentId, $idempotencyKey, (int) $user['user_id']]);
        $payId = (int) Database::pdo()->lastInsertId();
        if ($kind === 'payment') {
            Database::pdo()->prepare('UPDATE orders SET paid_amount = paid_amount + ?, status = IF(paid_amount + ? >= amount, \'paid\', \'partial_paid\') WHERE id = ?')->execute([$amount, $amount, (int) $order['id']]);
            $fresh = $this->first('SELECT status, paid_amount, amount FROM orders WHERE id = ?', [(int) $order['id']]);
            if (($fresh['status'] ?? '') === 'paid') {
                Database::pdo()->prepare('UPDATE deals SET paid_on = CURDATE() WHERE id = ?')->execute([(int) $order['deal_id']]);
            }
        } else {
            Database::pdo()->prepare('UPDATE orders SET paid_amount = GREATEST(0, paid_amount - ?), status = \'returned\' WHERE id = ?')->execute([$amount, (int) $order['id']]);
        }
        $this->addEvent((int) $order['deal_id'], 'pay-' . $idempotencyKey, 'payment', $kind . ' ' . $amount, (int) $user['user_id']);
        $this->audit->log((int) $user['user_id'], 'payment', (string) $payId, $kind, null, ['amount' => $amount, 'source' => 'onec', 'mode' => 'test']);

        return ['created' => true, 'payment_id' => $payId, 'mode' => 'test'];
    }

    /** @param array<string, mixed> $user */
    public function manualPayment(array $user, int $orderId, int $amount, string $evidence): array
    {
        $authorized = (string) $user['role_slug'] === 'owner';
        $guard = PaymentGuard::manualConfirm($authorized, $evidence);
        if (!$guard['ok']) {
            throw new AppException((string) $guard['error'], $authorized ? 422 : 403);
        }
        $order = $this->first('SELECT * FROM orders WHERE id = ?', [$orderId]);
        if (!$order) {
            throw new AppException('Заказ не найден', 404);
        }
        $this->oneDeal($user, (int) $order['deal_id']);
        Database::pdo()->prepare(
            'INSERT INTO payments (order_id, deal_id, amount, kind, source, paid_on, evidence, confirmed_by) VALUES (?,?,?,\'payment\',\'manual\',CURDATE(),?,?)'
        )->execute([$orderId, (int) $order['deal_id'], $amount, $evidence, (int) $user['user_id']]);
        Database::pdo()->prepare('UPDATE orders SET paid_amount = paid_amount + ? WHERE id = ?')->execute([$amount, $orderId]);
        $fresh = $this->first('SELECT paid_amount, amount FROM orders WHERE id = ?', [$orderId]);
        if ((int) $fresh['paid_amount'] >= (int) $fresh['amount']) {
            Database::pdo()->prepare("UPDATE orders SET status = 'paid' WHERE id = ?")->execute([$orderId]);
            Database::pdo()->prepare('UPDATE deals SET paid_on = CURDATE() WHERE id = ?')->execute([(int) $order['deal_id']]);
        }
        $this->audit->log((int) $user['user_id'], 'payment', (string) $orderId, 'manual', null, ['amount' => $amount, 'label' => 'ручное подтверждение', 'evidence' => $evidence]);

        return ['ok' => true, 'label' => 'ручное подтверждение'];
    }

    /** @param array<string, mixed> $user */
    public function ingestCall(array $user, array $event): array
    {
        $this->need($user, 'calls', 'view');
        $external = trim((string) ($event['external_id'] ?? ''));
        if ($external === '') {
            throw new AppException('Нужен ID звонка');
        }
        $existing = $this->first('SELECT * FROM calls WHERE external_id = ?', [$external]);
        $callbackExists = $existing && !empty($existing['callback_task_id']);
        $applied = CallIngest::apply($existing, $event, (bool) $callbackExists);
        $phone = Phone::normalize((string) ($applied['call']['phone'] ?? ''));
        $client = $phone !== '' ? $this->first('SELECT id FROM clients WHERE phone = ? ORDER BY id DESC LIMIT 1', [$phone]) : null;
        $deal = $client ? $this->first(
            'SELECT d.id FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id WHERE d.client_id = ? AND s.is_won = 0 AND s.is_lost = 0 ORDER BY d.id DESC LIMIT 1',
            [(int) $client['id']]
        ) : null;
        if (!$client && $phone !== '') {
            $created = $this->ingestLead($user, [
                'name' => 'Звонок ' . $phone,
                'phone' => $phone,
                'source' => 'call',
                'channel' => 'call',
                'event_id' => 'call-' . $external,
                'title' => 'Входящий звонок',
            ]);
            $deal = ['id' => $created['deal_id']];
            $client = $this->first('SELECT client_id AS id FROM deals WHERE id = ?', [$created['deal_id']]);
        }
        $pdo = Database::pdo();
        if ($existing) {
            $pdo->prepare(
                'UPDATE calls SET direction = ?, phone = ?, result = ?, duration_sec = ?, connected_at = ?, recording_url = COALESCE(?, recording_url), client_id = COALESCE(?, client_id), deal_id = COALESCE(?, deal_id) WHERE id = ?'
            )->execute([
                (string) ($applied['call']['direction'] ?? $existing['direction']),
                $phone,
                (string) ($applied['call']['result'] ?? $existing['result']),
                (int) ($applied['call']['duration_sec'] ?? $existing['duration_sec']),
                $applied['call']['connected_at'] ?? $existing['connected_at'],
                $applied['call']['recording_url'] ?? null,
                $client['id'] ?? null,
                $deal['id'] ?? null,
                (int) $existing['id'],
            ]);
            $callId = (int) $existing['id'];
        } else {
            $pdo->prepare(
                'INSERT INTO calls (external_id, direction, phone, user_id, client_id, deal_id, started_at, connected_at, duration_sec, result, recording_url)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?)'
            )->execute([
                $external,
                (string) ($event['direction'] ?? 'in'),
                $phone,
                (int) ($event['user_id'] ?? $user['user_id']),
                $client['id'] ?? null,
                $deal['id'] ?? null,
                $event['started_at'] ?? date('Y-m-d H:i:s'),
                $event['connected_at'] ?? null,
                (int) ($event['duration_sec'] ?? 0),
                (string) ($event['result'] ?? 'answered'),
                $event['recording_url'] ?? null,
            ]);
            $callId = (int) $pdo->lastInsertId();
        }
        if ($applied['create_callback'] && !empty($deal['id'])) {
            $task = $this->taskService->create($user, [
                'title' => 'Перезвонить ' . $phone,
                'assignee_id' => (int) ($event['user_id'] ?? $user['user_id']),
                'department_id' => $this->deptId('sales'),
                'due_at' => date('Y-m-d H:i:s', time() + 1800),
                'deal_id' => (int) $deal['id'],
                'priority' => 'high',
            ]);
            $pdo->prepare('UPDATE calls SET callback_task_id = ? WHERE id = ?')->execute([(int) $task['id'], $callId]);
        }
        if (!empty($deal['id'])) {
            $this->addEvent((int) $deal['id'], 'call-' . $external, 'call', 'Звонок ' . ($event['result'] ?? ''), (int) $user['user_id']);
        }

        return ['id' => $callId, 'updated' => $applied['updated'], 'callback' => $applied['create_callback'], 'mode' => 'test'];
    }

    /** @param array<string, mixed> $user */
    public function analyzeCall(array $user, int $callId, ?string $transcript): array
    {
        $this->need($user, 'calls', 'view');
        $call = $this->first('SELECT * FROM calls WHERE id = ?', [$callId]);
        if (!$call) {
            throw new AppException('Звонок не найден', 404);
        }
        $existing = $this->first('SELECT id, status FROM call_analyses WHERE call_id = ?', [$callId]);
        if ($existing && $existing['status'] === 'ready') {
            return ['id' => (int) $existing['id'], 'status' => 'ready', 'duplicate' => true];
        }
        if ((string) $call['result'] === 'missed' || (int) $call['duration_sec'] === 0) {
            $this->saveAnalysis($callId, 'error', null, null, null, null, 'Пропущенный звонок без разговора не оценивается');

            return ['status' => 'error', 'error' => 'Пропущенный звонок без разговора не оценивается'];
        }
        if ($transcript === null || trim($transcript) === '') {
            $this->saveAnalysis($callId, 'error', null, null, null, null, 'Нет записи или расшифровки');

            return ['status' => 'error', 'error' => 'Нет записи или расшифровки'];
        }
        $extracted = $this->extract($transcript);
        $items = [
            ['code' => 'need', 'weight' => 1, 'result' => $extracted['need'] === 'не указано' ? 'unknown' : 'done', 'quote' => $extracted['need']],
            ['code' => 'product', 'weight' => 1, 'result' => $extracted['product'] === 'не указано' ? 'unknown' : 'done', 'quote' => $extracted['product']],
            ['code' => 'terms', 'weight' => 1, 'result' => $extracted['delivery'] === 'не указано' ? 'unknown' : 'done', 'quote' => $extracted['delivery']],
            ['code' => 'objection', 'weight' => 1, 'result' => $extracted['objection'] === 'не указано' ? 'na' : 'done', 'quote' => $extracted['objection']],
            ['code' => 'next', 'weight' => 1, 'result' => $extracted['next_step'] === 'не указано' ? 'fail' : 'done', 'quote' => $extracted['next_step']],
        ];
        $score = ManagerScore::summarize($items, (float) $this->setting('score_completeness', 0.6));
        $summary = 'Разбор тестового режима, не внешний AI. ' . $extracted['need'];
        $suggestions = [
            'product_interest' => $extracted['product'],
            'client_task' => $extracted['need'],
            'requirements' => $extracted['requirements'],
        ];
        $this->saveAnalysis($callId, 'ready', $transcript, $summary, $extracted, ['items' => $items, 'score' => $score], null, $suggestions);

        return ['status' => 'ready', 'summary' => $summary, 'extracted' => $extracted, 'score' => $score, 'label' => 'оценка ИИ'];
    }

    /** @param array<string, mixed> $user */
    public function applySuggestion(array $user, int $callId): array
    {
        $this->need($user, 'sales', 'update');
        $analysis = $this->first('SELECT a.suggestions, c.deal_id FROM call_analyses a JOIN calls c ON c.id = a.call_id WHERE a.call_id = ?', [$callId]);
        if (!$analysis || !$analysis['deal_id']) {
            throw new AppException('Нет предложений или сделки', 404);
        }
        $suggestions = json_decode((string) $analysis['suggestions'], true) ?: [];
        $deal = $this->oneDeal($user, (int) $analysis['deal_id']);
        $sets = [];
        $params = [];
        foreach (['product_interest' => 'product_interest', 'client_task' => 'client_task', 'requirements' => 'requirements'] as $col => $key) {
            $value = $suggestions[$key] ?? '';
            if ($value === '' || $value === 'не указано') {
                continue;
            }
            if (trim((string) ($deal[$col] ?? '')) !== '') {
                continue;
            }
            $sets[] = $col . ' = ?';
            $params[] = $value;
        }
        if ($sets !== []) {
            $params[] = (int) $analysis['deal_id'];
            Database::pdo()->prepare('UPDATE deals SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);
        }
        $this->audit->log((int) $user['user_id'], 'deal', (string) $analysis['deal_id'], 'ai_suggest_apply', null, ['author' => $user['user_id'], 'fields' => $sets]);

        return ['updated_fields' => count($sets), 'note' => 'Этап и оплата не менялись'];
    }

    /** @param array<string, mixed> $user */
    public function syncCatalog(array $user): array
    {
        $this->need($user, 'warehouse', 'update');
        $path = dirname(__DIR__, 2) . '/storage/fixtures/onec_catalog.json';
        if (!is_file($path)) {
            throw new AppException('Тестовый источник 1С не найден', 503);
        }
        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data)) {
            throw new AppException('Тестовый каталог повреждён', 503);
        }
        $pdo = Database::pdo();
        $now = date('Y-m-d H:i:s');
        $n = 0;
        foreach ($data['products'] as $product) {
            $pdo->prepare(
                'INSERT INTO products (onec_id, sku, name, unit, characteristics, min_price, price, synced_at, is_demo)
                 VALUES (?,?,?,?,?,?,?,?,1)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), min_price = VALUES(min_price), characteristics = VALUES(characteristics), synced_at = VALUES(synced_at)'
            )->execute([
                $product['onec_id'],
                $product['sku'],
                $product['name'],
                $product['unit'] ?? 'шт',
                $product['characteristics'] ?? '',
                (int) $product['min_price'],
                (int) $product['price'],
                $now,
            ]);
            $id = (int) $pdo->query('SELECT id FROM products WHERE sku = ' . $pdo->quote((string) $product['sku']))->fetchColumn();
            foreach ($product['stock'] as $wh => $qty) {
                $physical = (int) $qty['physical'];
                $reserved = (int) $qty['reserved'];
                $pdo->prepare(
                    'INSERT INTO stock (product_id, warehouse_code, physical, reserved, available, synced_at) VALUES (?,?,?,?,?,?)
                     ON DUPLICATE KEY UPDATE physical = VALUES(physical), reserved = VALUES(reserved), available = VALUES(available), synced_at = VALUES(synced_at)'
                )->execute([$id, $wh, $physical, $reserved, max(0, $physical - $reserved), $now]);
            }
            $n++;
        }
        $this->audit->log((int) $user['user_id'], 'onec', 'catalog', 'sync', null, ['count' => $n, 'mode' => 'test']);

        return ['synced' => $n, 'synced_at' => $now, 'mode' => 'test'];
    }

    /** @param array<string, mixed> $user */
    public function warehouse(array $user): array
    {
        $this->need($user, 'warehouse', 'view');
        $rows = $this->all(
            'SELECT p.sku, p.name, p.price, p.min_price, s.warehouse_code, s.physical, s.reserved, s.available, s.synced_at
             FROM stock s JOIN products p ON p.id = s.product_id ORDER BY p.name',
            []
        );
        $synced = $rows[0]['synced_at'] ?? null;

        return [
            'items' => $rows,
            'synced_at' => $synced,
            'warning' => StockFreshness::warning($synced ? (string) $synced : null, time()),
            'mode' => 'test',
        ];
    }

    /** @param array<string, mixed> $user */
    public function report(array $user, string $from, string $to): array
    {
        $this->need($user, 'reports', 'view');
        $deals = $this->reportDeals($user, $from, $to);
        $payments = $this->all(
            'SELECT kind, amount, paid_on AS `on` FROM payments WHERE paid_on BETWEEN ? AND ?',
            [$from, $to]
        );
        $orders = $this->all(
            "SELECT amount, paid_on AS fully_paid_on FROM deals WHERE paid_on IS NOT NULL AND paid_on BETWEEN ? AND ?",
            [$from, $to]
        );
        $tasks = $this->all(
            "SELECT status, DATE(due_at) due_on, DATE(completed_at) completed_on FROM tasks",
            []
        );
        $asOf = $to;
        $cohort = KpiMath::cohortConversion($deals, $from, $to, $asOf);
        $spendRows = $this->all('SELECT source, amount FROM marketing_spend WHERE period_month = ? AND confirmed_at IS NOT NULL', [substr($from, 0, 7)]);
        $spend = 0;
        foreach ($spendRows as $row) {
            $spend += (int) $row['amount'];
        }
        $leads = KpiMath::newLeads($deals, $from, $to);
        $paidCohort = $cohort['paid'];

        return [
            'period' => ['from' => $from, 'to' => $to],
            'updated_at' => date('c'),
            'currency' => 'KZT',
            'note' => 'Поступления — не бухгалтерская выручка. Чистая прибыль не считается.',
            'funnel_rule' => 'Переход считается по первому входу в этап',
            'metrics' => [
                ['code' => 'new_leads', 'label' => 'Новые заявки', 'value' => $leads],
                ['code' => 'conversion', 'label' => 'Конверсия когорты', 'value' => $cohort['percent'], 'suffix' => '%'],
                ['code' => 'receipts', 'label' => 'Поступления', 'value' => KpiMath::receipts($payments, $from, $to)],
                ['code' => 'avg_check', 'label' => 'Средний оплаченный чек', 'value' => KpiMath::averagePaidCheck($orders, $from, $to)],
                ['code' => 'cpl', 'label' => 'CPL', 'value' => KpiMath::cpl($spend, $leads)],
                ['code' => 'sale_cost', 'label' => 'Стоимость продажи', 'value' => KpiMath::costOfSale($spend, $paidCohort, $asOf)['value'], 'as_of' => $asOf],
                ['code' => 'overdue_tasks', 'label' => 'Просрочки задач', 'value' => KpiMath::overdueOpen($tasks, $asOf)],
                ['code' => 'on_time', 'label' => 'В срок выполнено', 'value' => KpiMath::onTimePercent($tasks), 'suffix' => '%'],
            ],
        ];
    }

    /** @param array<string, mixed> $user */
    public function drill(array $user, string $metric, string $from, string $to): array
    {
        $this->need($user, 'reports', 'view');
        if ($metric === 'new_leads' || $metric === 'conversion') {
            $rows = $this->reportDeals($user, $from, $to);
            $out = [];
            foreach ($rows as $row) {
                if (!empty($row['is_test']) || !empty($row['is_duplicate'])) {
                    continue;
                }
                if ($row['created_on'] < $from || $row['created_on'] > $to) {
                    continue;
                }
                $out[] = ['id' => $row['id'], 'href' => '/sales?deal=' . $row['id'], 'title' => $row['title'] ?? ('Сделка ' . $row['id'])];
            }

            return ['metric' => $metric, 'rows' => $out, 'updated_at' => date('c')];
        }
        if ($metric === 'overdue_tasks') {
            $rows = $this->all(
                "SELECT id, title FROM tasks WHERE status NOT IN ('done','cancelled') AND due_at IS NOT NULL AND DATE(due_at) < ?",
                [$to]
            );

            return ['metric' => $metric, 'rows' => array_map(static fn ($r) => ['id' => $r['id'], 'href' => '/tasks?task=' . $r['id'], 'title' => $r['title']], $rows), 'updated_at' => date('c')];
        }

        return ['metric' => $metric, 'rows' => [], 'updated_at' => date('c')];
    }

    /** @param array<string, mixed> $user */
    public function team(array $user): array
    {
        $this->need($user, 'team', 'view');
        $rows = $this->all(
            'SELECT u.id, u.name, u.initials, r.name role_name, d.name dept_name, d.color,
                    (SELECT COUNT(DISTINCT t.id) FROM tasks t WHERE t.status NOT IN (\'done\',\'cancelled\') AND (t.assignee_id = u.id OR EXISTS (SELECT 1 FROM task_assignees ta WHERE ta.task_id = t.id AND ta.user_id = u.id))) open_tasks
             FROM users u
             JOIN roles r ON r.id = u.role_id
             LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.is_active = 1' . (\Trx\Security\Policy::isSuperadmin($user) ? '' : ' AND ' . \Trx\Security\Policy::hideSuperadminSql('u')) . '
             ORDER BY open_tasks DESC',
            []
        );

        return ['people' => $rows];
    }

    /** @param array<string, mixed> $user */
    public function botTurn(array $user, string $channel, string $externalUser, string $text): array
    {
        $this->need($user, 'bot', 'update');
        $pdo = Database::pdo();
        $session = $this->first('SELECT * FROM bot_sessions WHERE channel = ? AND external_user = ?', [$channel, $externalUser]);
        if (!$session) {
            $pdo->prepare('INSERT INTO bot_sessions (channel, external_user, slots) VALUES (?,?,?)')->execute([$channel, $externalUser, '{}']);
            $session = $this->first('SELECT * FROM bot_sessions WHERE channel = ? AND external_user = ?', [$channel, $externalUser]);
        }
        $products = $this->all('SELECT name, sku, price, synced_at FROM products ORDER BY name', []);
        $synced = $products[0]['synced_at'] ?? null;
        $fresh = StockFreshness::warning($synced ? (string) $synced : null, time()) === null;
        $knowledge = [];
        foreach ($this->all('SELECT topic, body, approved FROM knowledge_articles', []) as $row) {
            $knowledge[$row['topic']] = (int) $row['approved'] === 1 ? (string) $row['body'] : 'не утверждено';
        }
        $turn = BotEngine::turn($text, [
            'handed_off' => (int) $session['handed_off'] === 1,
            'fresh' => $fresh,
            'products' => $products,
            'knowledge' => $knowledge,
        ]);
        $pdo->prepare('INSERT INTO bot_messages (session_id, direction, body) VALUES (?,\'in\',?)')->execute([(int) $session['id'], $text]);
        if ($turn['stop'] && $turn['reply'] === '') {
            return ['reply' => '', 'handoff' => true, 'stopped' => true];
        }
        if ($turn['reply'] !== '') {
            $pdo->prepare('INSERT INTO bot_messages (session_id, direction, body) VALUES (?,\'out\',?)')->execute([(int) $session['id'], $turn['reply']]);
        }
        $slots = json_decode((string) ($session['slots'] ?? '{}'), true) ?: [];
        $slots = array_merge($slots, $turn['slots']);
        $dealId = $session['deal_id'] ? (int) $session['deal_id'] : null;
        if (!$turn['handoff'] && $dealId === null && !empty($slots['tool']) && !empty($slots['budget']) && !empty($slots['city'])) {
            $lead = $this->ingestLead($user, [
                'name' => 'Клиент ' . $externalUser,
                'phone' => preg_match('/^7\d{10}$/', $externalUser) ? $externalUser : '',
                'source' => 'bot',
                'channel' => $channel,
                'title' => 'Заявка бота: ' . $slots['tool'],
                'event_id' => 'bot-' . $channel . '-' . $externalUser,
            ]);
            $dealId = (int) $lead['deal_id'];
            $pdo->prepare('UPDATE deals SET client_task = ?, requirements = ? WHERE id = ?')->execute([
                $slots['task'] ?? $slots['tool'],
                'Бюджет ' . $slots['budget'] . ', город ' . $slots['city'],
                $dealId,
            ]);
        }
        if ($turn['handoff']) {
            $pdo->prepare('UPDATE bot_sessions SET handed_off = 1, handoff_reason = ?, summary = ?, slots = ?, deal_id = ? WHERE id = ?')->execute([
                $turn['reason'],
                $text,
                json_encode($slots, JSON_UNESCAPED_UNICODE),
                $dealId,
                (int) $session['id'],
            ]);
        } else {
            $pdo->prepare('UPDATE bot_sessions SET slots = ?, deal_id = ? WHERE id = ?')->execute([
                json_encode($slots, JSON_UNESCAPED_UNICODE),
                $dealId,
                (int) $session['id'],
            ]);
        }

        return ['reply' => $turn['reply'], 'handoff' => $turn['handoff'], 'deal_id' => $dealId, 'reason' => $turn['reason']];
    }

    /** @param array<string, mixed> $user */
    public function returnBot(array $user, string $channel, string $externalUser): array
    {
        $this->need($user, 'bot', 'update');
        Database::pdo()->prepare('UPDATE bot_sessions SET handed_off = 0, handoff_reason = NULL WHERE channel = ? AND external_user = ?')->execute([$channel, $externalUser]);

        return ['handed_off' => false];
    }

    public function flagOverdueSla(): int
    {
        $rows = $this->all(
            "SELECT d.id, d.title FROM deals d
             JOIN pipeline_stages s ON s.id = d.stage_id
             WHERE d.first_human_reply_at IS NULL AND d.sla_due_at < NOW() AND s.is_won = 0 AND s.is_lost = 0",
            []
        );
        $rop = $this->first("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' AND u.is_active = 1 AND u.deleted_at IS NULL LIMIT 1", []);
        if (!$rop) {
            return 0;
        }
        $n = 0;
        $notifications = new NotificationService();
        foreach ($rows as $row) {
            if ($notifications->notify((int) $rop['id'], 'sla_overdue', 'Просрочен первый ответ', (string) $row['title'], '/sales?deal=' . $row['id'], 'sla-' . $row['id'])) {
                $n++;
            }
        }

        return $n;
    }

    /** @param array<string, mixed> $snapshot */
    private function quoteHtml(array $snapshot, string $number): string
    {
        $rows = '';
        foreach ($snapshot['items'] ?? [] as $item) {
            $rows .= '<tr><td>' . htmlspecialchars((string) $item['name']) . '</td><td>' . htmlspecialchars((string) $item['sku']) . '</td><td class="num">' . (int) $item['qty'] . '</td><td class="num">' . number_format((int) $item['price'], 0, '.', ' ') . '</td><td class="num">' . number_format((int) $item['line_total'], 0, '.', ' ') . '</td></tr>';
        }
        $warn = htmlspecialchars((string) ($snapshot['stock_warning'] ?? ''));

        return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП ' . htmlspecialchars($number) . '</title><style>body{font-family:Inter,sans-serif;background:#fff;color:#111;padding:32px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}.num{text-align:right;font-variant-numeric:tabular-nums}.note{color:#9a3412}</style></head><body><p class="note">' . htmlspecialchars((string) ($snapshot['notice'] ?? '')) . '</p><h1>Коммерческое предложение ' . htmlspecialchars($number) . '</h1><p>' . htmlspecialchars((string) ($snapshot['client'] ?? '')) . '</p>' . ($warn !== '' ? '<p class="note">' . $warn . '</p>' : '') . '<table><thead><tr><th>Товар</th><th>Артикул</th><th>Кол-во</th><th>Цена</th><th>Сумма</th></tr></thead><tbody>' . $rows . '</tbody></table><p><strong>Итого: ' . number_format((int) ($snapshot['total'] ?? 0), 0, '.', ' ') . ' ₸</strong></p><p>Это не счёт, не накладная и не счёт-фактура.</p></body></html>';
    }

    /** @return array<string, string> */
    private function extract(string $transcript): array
    {
        $text = mb_strtolower($transcript);
        $pick = static function (string $pattern, string $text): string {
            return preg_match($pattern, $text, $m) ? trim($m[1]) : 'не указано';
        };

        return [
            'need' => $pick('/потребност[ьи][:\s]+([^\n]+)/u', $text),
            'product' => $pick('/товар[:\s]+([^\n]+)/u', $text),
            'requirements' => $pick('/характер[а-я]*[:\s]+([^\n]+)/u', $text),
            'qty' => $pick('/количеств[оа][:\s]+([^\n]+)/u', $text),
            'budget' => $pick('/бюджет[:\s]+([^\n]+)/u', $text),
            'city' => $pick('/город[:\s]+([^\n]+)/u', $text),
            'delivery' => $pick('/доставк[ауи][:\s]+([^\n]+)/u', $text),
            'objection' => $pick('/возражен[а-я]*[:\s]+([^\n]+)/u', $text),
            'promise' => $pick('/обеща[а-я]*[:\s]+([^\n]+)/u', $text),
            'next_step' => $pick('/следующ[а-я\s]*шаг[:\s]+([^\n]+)/u', $text),
        ];
    }

    /** @param array<string, mixed>|null $suggestions */
    private function saveAnalysis(int $callId, string $status, ?string $transcript, ?string $summary, ?array $extracted, ?array $score, ?string $error, ?array $suggestions = null): void
    {
        Database::pdo()->prepare(
            'INSERT INTO call_analyses (call_id, status, transcript, summary, extracted, score, suggestions, error)
             VALUES (?,?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), transcript = VALUES(transcript), summary = VALUES(summary), extracted = VALUES(extracted), score = VALUES(score), suggestions = VALUES(suggestions), error = VALUES(error)'
        )->execute([
            $callId,
            $status,
            $transcript === null ? null : json_encode(['text' => $transcript], JSON_UNESCAPED_UNICODE),
            $summary,
            $extracted === null ? null : json_encode($extracted, JSON_UNESCAPED_UNICODE),
            $score === null ? null : json_encode($score, JSON_UNESCAPED_UNICODE),
            $suggestions === null ? null : json_encode($suggestions, JSON_UNESCAPED_UNICODE),
            $error,
        ]);
    }

    /** @param array<string, mixed> $user */
    private function need(array $user, string $resource, string $action): void
    {
        if (!$this->policy->can($user, $resource, $action)) {
            throw new AppException('Недостаточно прав', 403);
        }
    }

    /** @param array<string, mixed> $user @return array{0:string,1:list<mixed>} */
    private function dealSql(array $user): array
    {
        $sql = 'SELECT d.*, c.name AS client_name, c.phone, s.slug AS stage_slug, s.name AS stage_name, u.name AS owner_name, u.initials AS owner_initials, u.deleted_at AS owner_deleted_at
                FROM deals d
                JOIN clients c ON c.id = d.client_id
                JOIN pipeline_stages s ON s.id = d.stage_id
                JOIN users u ON u.id = d.owner_id
                WHERE 1=1';
        unset($user);

        return [$sql, []];
    }

    /** @param array<string, mixed> $user @return array<string, mixed> */
    private function oneDeal(array $user, int $id): array
    {
        [$sql, $params] = $this->dealSql($user);
        $sql .= ' AND d.id = ?';
        $params[] = $id;
        $row = $this->first($sql, $params);
        if (!$row) {
            throw new AppException('Сделка не найдена', 404);
        }

        return $row;
    }

    /** @param array<string, mixed> $row */
    private function dealCard(array $row): array
    {
        $idle = $row['last_activity_at'] ? (int) floor((time() - strtotime((string) $row['last_activity_at'])) / 3600) : null;

        return [
            'id' => (int) $row['id'],
            'number' => $row['number'],
            'title' => $row['title'],
            'client_name' => $row['client_name'],
            'phone' => $row['phone'],
            'stage_slug' => $row['stage_slug'],
            'channel' => $row['channel'],
            'source' => $row['source'],
            'amount' => (int) $row['amount'],
            'owner_name' => Policy::personName((string) $row['owner_name'], $row['owner_deleted_at'] ?? null),
            'owner_initials' => $row['owner_initials'],
            'owner_id' => (int) $row['owner_id'],
            'next_contact_at' => $row['next_contact_at'],
            'idle_hours' => $idle,
            'loss_reason' => $row['loss_reason'],
            'paid_on' => $row['paid_on'],
            'client_replied' => (int) $row['client_replied'] === 1,
            'client_task' => $row['client_task'],
            'product_interest' => $row['product_interest'],
            'requirements' => $row['requirements'],
            'objection' => $row['objection'],
            'payment_terms' => $row['payment_terms'],
        ];
    }

    /** @param array<string, mixed> $row @param array<string, mixed> $input @return array<string, mixed> */
    private function snapshot(array $row, array $input): array
    {
        $items = (int) $this->first('SELECT COUNT(*) c FROM deal_items WHERE deal_id = ?', [(int) $row['id']])['c'];
        $quoteSent = (int) $this->first('SELECT COUNT(*) c FROM quotes WHERE deal_id = ? AND sent_at IS NOT NULL', [(int) $row['id']])['c'] > 0;
        $order = $this->first('SELECT id, amount, status FROM orders WHERE deal_id = ? ORDER BY id DESC LIMIT 1', [(int) $row['id']]);
        $paid = $this->first("SELECT source FROM payments WHERE deal_id = ? AND kind = 'payment' ORDER BY id DESC LIMIT 1", [(int) $row['id']]);

        return [
            'client_name' => $input['client_name'] ?? $row['client_name'],
            'source' => $input['source'] ?? $row['source'],
            'client_replied' => !empty($input['client_replied']) || (int) $row['client_replied'] === 1,
            'client_task' => $input['client_task'] ?? $row['client_task'],
            'product' => $input['product'] ?? $row['product_interest'],
            'requirements' => $input['requirements'] ?? $row['requirements'],
            'has_items' => $items > 0,
            'has_prices' => $items > 0,
            'quote_sent' => $quoteSent || !empty($input['manual_quote_sent']),
            'objection' => $input['objection'] ?? $row['objection'],
            'next_contact_at' => $input['next_contact_at'] ?? $row['next_contact_at'],
            'has_order' => $order !== null,
            'amount' => (int) ($order['amount'] ?? $row['amount']),
            'payment_terms' => $input['payment_terms'] ?? $row['payment_terms'],
            'payment_confirmed' => ($order['status'] ?? '') === 'paid',
            'payment_source' => $paid['source'] ?? '',
            'loss_reason' => $input['loss_reason'] ?? $row['loss_reason'],
        ];
    }

    /** @return list<array{id:int|string,phone:string,event_ids:list<string>}> */
    private function openDeals(string $phone): array
    {
        if ($phone === '') {
            return [];
        }
        $rows = $this->all(
            'SELECT d.id, c.phone FROM deals d JOIN clients c ON c.id = d.client_id JOIN pipeline_stages s ON s.id = d.stage_id WHERE c.phone = ? AND s.is_won = 0 AND s.is_lost = 0',
            [$phone]
        );
        $out = [];
        foreach ($rows as $row) {
            $events = $this->all('SELECT event_key FROM deal_events WHERE deal_id = ? AND event_key IS NOT NULL', [(int) $row['id']]);
            $out[] = [
                'id' => (int) $row['id'],
                'phone' => (string) $row['phone'],
                'event_ids' => array_values(array_filter(array_map(static fn ($e) => (string) $e['event_key'], $events))),
            ];
        }

        return $out;
    }

    private function clientId(string $name, string $phone, int $ownerId): int
    {
        if ($phone !== '') {
            $found = $this->first('SELECT id FROM clients WHERE phone = ? ORDER BY id LIMIT 1', [$phone]);
            if ($found) {
                return (int) $found['id'];
            }
        }
        Database::pdo()->prepare('INSERT INTO clients (name, phone, owner_id, is_demo) VALUES (?,?,?,1)')->execute([$name, $phone, $ownerId > 0 ? $ownerId : null]);

        return (int) Database::pdo()->lastInsertId();
    }

    /** @param array<string, mixed> $input */
    private function assignOwner(array $input): int
    {
        if (!empty($input['owner_id'])) {
            return (int) $input['owner_id'];
        }
        $managers = $this->all(
            "SELECT u.id FROM users u
             JOIN roles r ON r.id = u.role_id
             JOIN user_modules m ON m.user_id = u.id AND m.module = 'sales'
             WHERE r.slug = 'employee' AND u.is_active = 1 AND u.deleted_at IS NULL
             ORDER BY u.id",
            []
        );
        if ($managers === []) {
            $owner = $this->first("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' LIMIT 1", []);

            return (int) $owner['id'];
        }
        $cursor = (int) $this->setting('assignment_cursor', 0);
        $index = $cursor % count($managers);
        $this->putSetting('assignment_cursor', $cursor + 1);

        return (int) $managers[$index]['id'];
    }

    private function stageId(string $slug): int
    {
        $row = $this->first('SELECT id FROM pipeline_stages WHERE pipeline_id = 1 AND slug = ?', [$slug]);
        if (!$row) {
            throw new AppException('Этап не найден');
        }

        return (int) $row['id'];
    }

    private function deptId(string $slug): int
    {
        $row = $this->first('SELECT id FROM departments WHERE slug = ?', [$slug]);

        return (int) ($row['id'] ?? 0);
    }

    private function refreshAmount(int $dealId): void
    {
        Database::pdo()->prepare('UPDATE deals SET amount = (SELECT COALESCE(SUM(line_total),0) FROM deal_items WHERE deal_id = ?) WHERE id = ?')->execute([$dealId, $dealId]);
    }

    private function addEvent(int $dealId, ?string $key, string $kind, string $body, int $userId): void
    {
        try {
            Database::pdo()->prepare('INSERT INTO deal_events (deal_id, event_key, kind, body, user_id) VALUES (?,?,?,?,?)')->execute([
                $dealId,
                $key !== null && $key !== '' ? $key : null,
                $kind,
                $body,
                $userId,
            ]);
        } catch (\PDOException) {
            // Повторный event_key не создаёт вторую запись.
        }
    }

    private function stockWarning(): ?string
    {
        $row = $this->first('SELECT MAX(synced_at) synced_at FROM stock', []);

        return StockFreshness::warning($row['synced_at'] ?? null, time());
    }

    private function calendar(): BusinessCalendar
    {
        return new BusinessCalendar(
            (string) $this->setting('schedule_open', '09:00'),
            (string) $this->setting('schedule_close', '18:00')
        );
    }

    private function setting(string $key, mixed $default): mixed
    {
        $row = $this->first('SELECT `value` FROM settings WHERE `key` = ?', [$key]);
        if (!$row) {
            return $default;
        }
        $decoded = json_decode((string) $row['value'], true);

        return $decoded === null ? $default : $decoded;
    }

    private function putSetting(string $key, mixed $value): void
    {
        Database::pdo()->prepare('INSERT INTO settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)')->execute([
            $key,
            json_encode($value, JSON_UNESCAPED_UNICODE),
        ]);
    }

    /** @param list<mixed> $params @return list<array<string, mixed>> */
    private function all(string $sql, array $params): array
    {
        $stmt = Database::pdo()->prepare($sql);
        $stmt->execute($params);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /** @param list<mixed> $params @return array<string, mixed>|null */
    private function first(string $sql, array $params): ?array
    {
        $rows = $this->all($sql, $params);

        return $rows[0] ?? null;
    }

    /**
     * @param array<string, mixed> $user
     * @return list<array<string, mixed>>
     */
    private function reportDeals(array $user, string $from, string $to): array
    {
        $sql = 'SELECT d.id, d.title, DATE(d.created_at) AS created_on, d.paid_on, d.is_test, d.is_duplicate
                FROM deals d
                JOIN pipeline_stages s ON s.id = d.stage_id
                WHERE 1=1';
        unset($user);
        $rows = $this->all($sql, []);
        foreach ($rows as &$row) {
            $row['is_test'] = (int) $row['is_test'] === 1;
            $row['is_duplicate'] = (int) $row['is_duplicate'] === 1;
        }

        return $rows;
    }
}
