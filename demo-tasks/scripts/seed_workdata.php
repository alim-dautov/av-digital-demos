<?php

declare(strict_types=1);

/**
 * Starter working data for the real team: deals across the funnel, tasks, daily report schedule.
 * Runs only on an empty base (after scripts/reset_data.php). Accounts come from migration 008.
 *
 * Usage: php scripts/seed_workdata.php
 */
require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;
use Trx\Domain\RecurrenceSchedule;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

$pdo = Database::pdo();
if ((int) $pdo->query('SELECT (SELECT COUNT(*) FROM tasks) + (SELECT COUNT(*) FROM deals)')->fetchColumn() > 0) {
    fwrite(STDERR, "Tasks or deals already exist. Run php scripts/reset_data.php --yes first.\n");
    exit(1);
}

$users = [];
foreach ($pdo->query('SELECT id, email, username FROM users') as $row) {
    $users[$row['username'] ?? $row['email']] = (int) $row['id'];
}
$need = ['daniyar', 'timur', 'erlan', 'arman', 'dinara'];
foreach ($need as $key) {
    if (!isset($users[$key])) {
        fwrite(STDERR, "Missing account {$key}. Run php scripts/migrate.php first.\n");
        exit(1);
    }
}
$depts = $pdo->query('SELECT slug, id FROM departments')->fetchAll(PDO::FETCH_KEY_PAIR);
$stages = $pdo->query('SELECT slug, id FROM pipeline_stages WHERE pipeline_id = 1 ORDER BY sort_order')->fetchAll(PDO::FETCH_KEY_PAIR);
$products = [];
foreach ($pdo->query('SELECT id, sku, name, unit, price FROM products ORDER BY id') as $row) {
    $products[] = $row;
}

$owner = (int) $pdo->query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' ORDER BY u.id LIMIT 1")->fetchColumn();
if ($owner <= 0) {
    fwrite(STDERR, "Missing owner. Run php scripts/migrate.php first.\n");
    exit(1);
}
$now = new DateTimeImmutable('now');
$at = static fn (string $modify, string $time = '18:00'): string => $now->modify($modify)->format('Y-m-d') . ' ' . $time . ':00';

// stage => fields required to be in that stage
$deals = [
    ['Ерлан Жумабеков', 'ТОО «СтройМонтаж»', '77000000001', 'instagram', 'daniyar', 'new_lead', 0, []],
    ['Айгерим Касымова', null, '77000000002', 'whatsapp', 'timur', 'new_lead', 0, []],
    ['Нурлан Абдрахманов', 'ИП Абдрахманов', '77000000003', 'call', 'erlan', 'contact_made', 0, []],
    ['Дмитрий Ковалёв', 'ТОО «АлмаРемСервис»', '77000000004', 'whatsapp', 'arman', 'contact_made', 0, []],
    ['Мадина Сейткали', null, '77000000005', 'instagram', 'dinara', 'need_defined', 1, ['client_task' => 'Ремонт квартиры под ключ', 'requirements' => 'Нужен перфоратор с SDS-plus и кейсом']],
    ['Бауыржан Оспанов', 'ТОО «KazBuild»', '77000000006', 'call', 'daniyar', 'need_defined', 3, ['client_task' => 'Оснащение бригады', 'requirements' => 'Шуруповёрты на 18В, два аккумулятора']],
    ['Сергей Ли', 'ТОО «Техноград»', '77000000007', 'whatsapp', 'timur', 'proposal_sent', 5, ['client_task' => 'Закупка инструмента на склад', 'requirements' => 'Перфораторы и шуруповёрты, доставка в Астану']],
    ['Асель Нуртаева', null, '77000000008', 'instagram', 'erlan', 'proposal_sent', 2, ['client_task' => 'Подарок мужу', 'requirements' => 'Шуруповёрт в комплекте с битами']],
    ['Тимур Ахметов', 'ИП Ахметов', '77000000009', 'call', 'arman', 'negotiation', 4, ['client_task' => 'Ремонт офисов', 'requirements' => 'Перфоратор, гарантия 2 года', 'objection' => 'Дорого, есть предложение дешевле', 'next_contact_at' => $at('+1 day', '11:00')]],
    ['Гульнара Мусина', 'ТОО «ЭлектроПлюс»', '77000000010', 'whatsapp', 'dinara', 'negotiation', 6, ['client_task' => 'Монтаж электрики', 'requirements' => 'Комплект для бригады из трёх человек', 'objection' => 'Нужна отсрочка платежа', 'next_contact_at' => $at('+2 days', '15:00')]],
    ['Арман Байжанов', 'ТОО «ПромСнаб»', '77000000011', 'call', 'daniyar', 'awaiting_payment', 8, ['client_task' => 'Пополнение склада', 'requirements' => 'Перфораторы, отгрузка партией', 'payment_terms' => 'Безнал, 100% предоплата по счёту']],
    ['Ольга Петренко', null, '77000000012', 'instagram', 'timur', 'won', 1, ['client_task' => 'Ремонт дачи', 'requirements' => 'Перфоратор', 'payment_terms' => 'Kaspi перевод']],
    ['Канат Ибраев', 'ИП Ибраев', '77000000013', 'whatsapp', 'erlan', 'won', 2, ['client_task' => 'Мебельный цех', 'requirements' => 'Шуруповёрты', 'payment_terms' => 'Наличные при получении']],
    ['Жанна Ермекова', null, '77000000014', 'call', 'arman', 'lost', 1, ['client_task' => 'Разовый ремонт', 'requirements' => 'Перфоратор', 'loss_reason' => 'Выбрал аренду инструмента']],
];

$insertClient = $pdo->prepare('INSERT INTO clients (name, company, phone, owner_id, channels) VALUES (?,?,?,?,?)');
$insertDeal = $pdo->prepare(
    'INSERT INTO deals (number, title, client_id, pipeline_id, stage_id, channel, source, owner_id, amount, client_replied, client_task, product_interest,
       requirements, objection, next_contact_at, payment_terms, loss_reason, first_human_reply_at, sla_due_at, paid_on, last_activity_at, created_at)
     VALUES (?,?,?,1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
);
$insertItem = $pdo->prepare('INSERT INTO deal_items (deal_id, product_id, sku, name, qty, unit, price, line_total) VALUES (?,?,?,?,?,?,?,?)');
$insertEntry = $pdo->prepare('INSERT INTO deal_stage_entries (deal_id, stage_id, entered_at) VALUES (?,?,?)');
$insertEvent = $pdo->prepare('INSERT INTO deal_events (deal_id, kind, body, user_id, created_at) VALUES (?,?,?,?,?)');
$stageOrder = array_keys($stages);
$dealIds = [];

foreach ($deals as $i => [$name, $company, $phone, $channel, $manager, $stage, $qty, $fields]) {
    $managerId = $users[$manager];
    $created = $now->modify('-' . (count($deals) - $i) . ' hours')->modify('-' . intdiv($i, 3) . ' days');
    $insertClient->execute([$name, $company, $phone, $managerId, json_encode([$channel])]);
    $clientId = (int) $pdo->lastInsertId();

    $product = $products === [] ? null : $products[$i % count($products)];
    $amount = $product !== null ? (int) $product['price'] * $qty : 0;
    $contacted = $stage !== 'new_lead';
    $insertDeal->execute([
        'DL-' . $created->format('ymd') . '-' . str_pad((string) (101 + $i), 3, '0', STR_PAD_LEFT),
        ($company ?? $name) . ($product !== null ? ': ' . mb_strtolower((string) $product['name']) : ''),
        $clientId,
        $stages[$stage],
        $channel,
        $channel,
        $managerId,
        $amount,
        $contacted ? 1 : 0,
        $fields['client_task'] ?? null,
        $qty > 0 && $product !== null ? $product['name'] : null,
        $fields['requirements'] ?? null,
        $fields['objection'] ?? null,
        $fields['next_contact_at'] ?? ($stage === 'new_lead' ? $now->modify('+30 minutes')->format('Y-m-d H:i:s') : null),
        $fields['payment_terms'] ?? null,
        $fields['loss_reason'] ?? null,
        $contacted ? $created->modify('+4 minutes')->format('Y-m-d H:i:s') : null,
        $created->modify('+5 minutes')->format('Y-m-d H:i:s'),
        $stage === 'won' ? $now->format('Y-m-d') : null,
        $now->modify('-' . $i * 20 . ' minutes')->format('Y-m-d H:i:s'),
        $created->format('Y-m-d H:i:s'),
    ]);
    $dealId = (int) $pdo->lastInsertId();
    $dealIds[$i] = ['id' => $dealId, 'client_id' => $clientId, 'manager' => $manager, 'name' => $name, 'stage' => $stage];

    if ($product !== null && $qty > 0) {
        $insertItem->execute([$dealId, $product['id'], $product['sku'], $product['name'], $qty, $product['unit'] ?? 'шт', $product['price'], $amount]);
    }
    $insertEvent->execute([$dealId, 'lead', 'Создана заявка', $managerId, $created->format('Y-m-d H:i:s')]);
    $path = $stage === 'lost' ? ['new_lead', 'contact_made', 'need_defined', 'lost'] : array_slice($stageOrder, 0, array_search($stage, $stageOrder, true) + 1);
    foreach ($path as $step => $slug) {
        $enteredAt = $created->modify('+' . $step * 2 . ' hours')->format('Y-m-d H:i:s');
        $insertEntry->execute([$dealId, $stages[$slug], $enteredAt]);
        if ($step > 0) {
            $insertEvent->execute([$dealId, 'stage', 'Этап: ' . $slug, $managerId, $enteredAt]);
        }
    }
    echo "deal {$name} -> {$stage}\n";
}

$tasks = [
    // title, description, assignee, dept, priority, status, due, deal index, checklist, comment
    ['Перезвонить по заявке из Instagram', 'Клиент оставил заявку ночью, уточнить задачу и бюджет.', 'daniyar', 'sales', 'high', 'new', $at('+0 days', '12:00'), 0, ['Уточнить объём работ', 'Предложить модель'], null],
    ['Ответить в WhatsApp по наличию', 'Спрашивает наличие и доставку по Алматы.', 'timur', 'sales', 'high', 'new', $at('+0 days', '11:00'), 1, [], null],
    ['Отправить каталог и прайс', 'После звонка клиент попросил прайс на перфораторы.', 'erlan', 'sales', 'medium', 'in_progress', $at('+0 days'), 2, ['Собрать актуальный прайс', 'Отправить в WhatsApp'], 'Каталог собрал, жду обновлённые цены.'],
    ['Подобрать комплектацию для бригады', 'Нужен расчёт на 3 шуруповёрта с запасными аккумуляторами.', 'daniyar', 'sales', 'high', 'in_progress', $at('+1 day'), 5, ['Проверить остатки', 'Посчитать скидку от объёма'], null],
    ['Подготовить КП для «Техноград»', 'Перфораторы и шуруповёрты с доставкой в Астану.', 'timur', 'sales', 'high', 'on_review', $at('+0 days', '16:00'), 6, ['Расчёт доставки', 'Согласовать скидку с РОП'], 'КП готово, прошу проверить скидку.'],
    ['Согласовать скидку 7% для ИП Ахметов', 'Клиент сравнивает с конкурентом, просит скидку.', 'arman', 'sales', 'high', 'in_progress', $at('+0 days'), 8, [], 'Жду решения РОП по скидке.'],
    ['Выставить счёт ТОО «ПромСнаб»', 'Предоплата 100%, счёт из 1С.', 'daniyar', 'sales', 'high', 'in_progress', $at('+0 days', '15:00'), 10, ['Создать счёт в 1С', 'Отправить на почту бухгалтерии'], null],
    ['Отсрочка платежа для «ЭлектроПлюс»', 'Подготовить условия отсрочки на 14 дней.', 'dinara', 'sales', 'medium', 'new', $at('+2 days'), 9, [], null],
    ['Уточнить требования по ремонту квартиры', 'Клиентка выбирает между двумя моделями.', 'dinara', 'sales', 'medium', 'in_progress', $at('+1 day'), 4, [], null],
    ['Проверить доставку заказа Ольги Петренко', 'Заказ оплачен, проверить отгрузку и трек.', 'timur', 'sales', 'low', 'done', $at('-1 day'), 11, [], 'Доставлено, клиент доволен.'],
    ['Взять отзыв у ИП Ибраев', 'Попросить отзыв в Instagram после покупки.', 'erlan', 'sales', 'low', 'new', $at('+3 days'), 12, [], null],
    ['Разобрать причину отказа', 'Клиент ушёл в аренду. Подумать над предложением аренды/рассрочки.', 'arman', 'sales', 'low', 'done', $at('-2 days'), 13, [], null],
    ['Обзвонить базу прошлых клиентов', 'Предложить новые модели шуруповёртов, 20 контактов.', 'erlan', 'sales', 'medium', 'in_progress', $at('+2 days'), null, ['Выгрузить список', 'Обзвонить 20 контактов', 'Записать итоги'], null],
    ['Заполнить карточки клиентов', 'У новых клиентов не хватает компании и канала.', 'arman', 'sales', 'low', 'new', $at('+1 day'), null, [], null],
    ['Изучить новые модели перфораторов', 'Подготовить короткую шпаргалку по характеристикам для команды.', 'dinara', 'sales', 'medium', 'on_review', $at('+0 days'), null, [], 'Шпаргалка во вложении, посмотрите.'],
    ['Еженедельный план продаж', 'Свести план по менеджерам на неделю.', 'daniyar', 'sales', 'high', 'in_progress', $at('+1 day', '10:00'), null, ['Собрать цифры от менеджеров', 'Отправить Айдару'], null],
    ['Сверить остатки перфораторов', 'Перед крупной отгрузкой «ПромСнаб».', 'timur', 'warehouse', 'high', 'new', $at('+0 days', '14:00'), null, [], null],
    ['Подготовить отгрузку в Астану', 'Упаковка и документы для «Техноград».', 'erlan', 'operations', 'medium', 'new', $at('+3 days'), null, [], null],
    ['Запустить рекламу шуруповёртов', 'Таргет в Instagram, бюджет согласовать.', 'arman', 'marketing', 'medium', 'in_progress', $at('+2 days'), null, ['Креативы', 'Согласовать бюджет'], null],
    ['Настроить доступы новым менеджерам', 'Проверить, что все сменили временный пароль.', 'dinara', 'it', 'medium', 'in_progress', $at('+1 day'), null, ['Данияр', 'Тимур', 'Ерлан', 'Арман', 'Динара'], null],
];

$insertTask = $pdo->prepare(
    'INSERT INTO tasks (number, title, description, creator_id, assignee_id, department_id, priority, status,
       starts_at, due_at, completed_at, comments_count, client_id, deal_id, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
);
$insertCheck = $pdo->prepare('INSERT INTO task_checklist (task_id, title, is_done, sort_order) VALUES (?,?,?,?)');
$insertComment = $pdo->prepare('INSERT INTO task_comments (task_id, user_id, body) VALUES (?,?,?)');
$insertAssignee = $pdo->prepare('INSERT IGNORE INTO task_assignees (task_id, user_id, position) VALUES (?,?,0)');
$insertHistory = $pdo->prepare('INSERT INTO task_history (task_id, user_id, field_name, old_value, new_value) VALUES (?,?,?,?,?)');

foreach ($tasks as $i => $t) {
    [$title, $description, $assignee, $dept, $priority, $status, $due, $dealIndex, $checklist, $comment] = $t;
    $assigneeId = $users[$assignee];
    $deal = $dealIndex !== null ? $dealIds[$dealIndex] : null;
    $insertTask->execute([
        'DEMO-' . $now->format('ymd') . '-' . str_pad((string) (1001 + $i), 4, '0', STR_PAD_LEFT),
        $title,
        $description,
        $owner,
        $assigneeId,
        (int) $depts[$dept],
        $priority,
        $status,
        $now->modify('-1 day')->format('Y-m-d 09:00:00'),
        $due,
        $status === 'done' ? $due : null,
        $comment !== null ? 1 : 0,
        $deal['client_id'] ?? null,
        $deal['id'] ?? null,
        $now->modify('-' . (count($tasks) - $i) * 15 . ' minutes')->format('Y-m-d H:i:s'),
    ]);
    $taskId = (int) $pdo->lastInsertId();
    foreach ($checklist as $order => $item) {
        $insertCheck->execute([$taskId, $item, $status === 'done' || ($status !== 'new' && $order === 0) ? 1 : 0, $order]);
    }
    if ($comment !== null) {
        $insertComment->execute([$taskId, $assigneeId, $comment]);
    }
    $insertAssignee->execute([$taskId, $assigneeId]);
    if ($status !== 'new') {
        $insertHistory->execute([$taskId, $assigneeId, 'status', 'new', $status]);
    }
    echo "task {$title}\n";
}

$templateId = (int) $pdo->query("SELECT id FROM task_templates WHERE slug = 'daily_report'")->fetchColumn();
if ($templateId > 0) {
    $insertRecurrence = $pdo->prepare(
        'INSERT INTO task_recurrences (template_id, assignee_id, creator_id, rule, weekdays, month_day, run_time, next_run_at) VALUES (?,?,?,?,?,?,?,?)'
    );
    foreach (['daniyar', 'timur', 'erlan', 'arman', 'dinara'] as $username) {
        $next = RecurrenceSchedule::next('weekly', [1, 2, 3, 4, 5], null, '18:00:00', $now);
        $insertRecurrence->execute([$templateId, $users[$username], $owner, 'weekly', '1,2,3,4,5', null, '18:00:00', $next->format('Y-m-d H:i:s')]);
        $pdo->prepare('INSERT IGNORE INTO task_recurrence_assignees (recurrence_id, user_id, position) VALUES (?,?,0)')
            ->execute([(int) $pdo->lastInsertId(), $users[$username]]);
        echo "recurrence daily_report -> {$username}\n";
    }
}

$pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('assignment_cursor', '0') ON DUPLICATE KEY UPDATE `value` = '0'")->execute();
echo 'seed_workdata done: ' . count($deals) . ' deals, ' . count($tasks) . " tasks\n";
