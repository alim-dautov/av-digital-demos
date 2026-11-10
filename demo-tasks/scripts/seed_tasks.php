<?php

declare(strict_types=1);

/**
 * Demo tasks matching docs/design screenshots.
 * Safe to re-run: clears demo tasks by number prefix DEMO-D-
 */
require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));
$pdo = Database::pdo();

$users = [];
foreach ($pdo->query('SELECT u.id, u.email, u.username, u.name, u.initials, r.slug AS role_slug, u.department_id
                      FROM users u JOIN roles r ON r.id = u.role_id') as $row) {
    $users[$row['email']] = $row;
    if (!empty($row['username'])) {
        $users[$row['username']] = $row;
    }
}
$depts = [];
foreach ($pdo->query('SELECT id, slug, name, color, icon FROM departments') as $row) {
    $depts[$row['slug']] = $row;
}

$required = ['aidar@demo.local', 'daniyar', 'timur', 'erlan', 'arman', 'dinara'];
foreach ($required as $key) {
    if (!isset($users[$key])) {
        fwrite(STDERR, "Missing user {$key}. Run php scripts/migrate.php first.\n");
        exit(1);
    }
}

$pdo->exec("DELETE FROM task_comments WHERE task_id IN (SELECT id FROM tasks WHERE number LIKE 'DEMO-D-%')");
$pdo->exec("DELETE FROM task_watchers WHERE task_id IN (SELECT id FROM tasks WHERE number LIKE 'DEMO-D-%')");
$pdo->exec("DELETE FROM tasks WHERE number LIKE 'DEMO-D-%'");

$aidar = (int) $users['aidar@demo.local']['id'];
$now = new DateTimeImmutable('now', new DateTimeZone('Asia/Almaty'));
$today = $now->setTime(18, 0);
$yesterday = $today->modify('-1 day');
$tomorrow = $today->modify('+1 day');
$d17 = $today->setDate((int) $today->format('Y'), (int) $today->format('m'), 17)->setTime(18, 0);
if ($d17 < $today->modify('-7 days')) {
    $d17 = $today->modify('+2 days');
}
$tasks = [
    [
        'number' => 'DEMO-D-001',
        'title' => 'Запустить обмен с 1С',
        'description' => 'Подключить тестовый контур обмена номенклатурой и остатками.',
        'assignee' => 'daniyar',
        'dept' => 'it',
        'priority' => 'high',
        'status' => 'in_progress',
        'due' => $tomorrow,
        'comments' => 2,
        'attachments' => 1,
    ],
    [
        'number' => 'DEMO-D-002',
        'title' => 'Согласовать скрипты продаж',
        'description' => 'Утвердить скрипты первого контакта для Instagram и WhatsApp.',
        'assignee' => 'timur',
        'dept' => 'sales',
        'priority' => 'high',
        'status' => 'on_review',
        'due' => $today,
        'comments' => 4,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-003',
        'title' => 'Проверить остатки DEMO',
        'description' => 'Сверка остатков по складу Алматы.',
        'assignee' => 'erlan',
        'dept' => 'warehouse',
        'priority' => 'high',
        'status' => 'in_progress',
        'due' => $yesterday,
        'comments' => 2,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-004',
        'title' => 'Подготовить рекламные видео',
        'description' => 'Короткий ролик для Instagram Reels.',
        'assignee' => 'arman',
        'dept' => 'marketing',
        'priority' => 'medium',
        'status' => 'in_progress',
        'due' => $d17,
        'comments' => 1,
        'attachments' => 3,
    ],
    [
        'number' => 'DEMO-D-005',
        'title' => 'Утвердить график отгрузок',
        'description' => 'Недельный график отгрузок по регионам.',
        'assignee' => 'dinara',
        'dept' => 'operations',
        'priority' => 'high',
        'status' => 'in_progress',
        'due' => $today,
        'comments' => 3,
        'attachments' => 1,
    ],
    [
        'number' => 'DEMO-D-006',
        'title' => 'Проверить комплектацию заказов',
        'description' => 'Контроль комплектации перед отправкой.',
        'assignee' => 'erlan',
        'dept' => 'warehouse',
        'priority' => 'medium',
        'status' => 'new',
        'due' => $tomorrow,
        'comments' => 0,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-007',
        'title' => 'Согласовать график отгрузок',
        'description' => 'Согласование с операциями.',
        'assignee' => 'dinara',
        'dept' => 'operations',
        'priority' => 'high',
        'status' => 'in_progress',
        'due' => $today,
        'comments' => 1,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-008',
        'title' => 'Обновить прайс для менеджеров',
        'description' => 'Актуальные цены из каталога.',
        'assignee' => 'timur',
        'dept' => 'sales',
        'priority' => 'medium',
        'status' => 'new',
        'due' => $tomorrow,
        'comments' => 0,
        'attachments' => 1,
    ],
    [
        'number' => 'DEMO-D-009',
        'title' => 'Контроль чатов поддержки',
        'description' => 'Ежедневный контроль непрочитанных диалогов.',
        'assignee' => 'daniyar',
        'dept' => 'sales',
        'priority' => 'medium',
        'status' => 'in_progress',
        'due' => $today,
        'comments' => 0,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-010',
        'title' => 'Проверка доступов CRM',
        'description' => 'Аудит ролей и отзыв лишних прав.',
        'assignee' => 'daniyar',
        'dept' => 'it',
        'priority' => 'low',
        'status' => 'on_review',
        'due' => $tomorrow,
        'comments' => 1,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-011',
        'title' => 'План контента на неделю',
        'description' => 'Календарь постов и Reels.',
        'assignee' => 'arman',
        'dept' => 'marketing',
        'priority' => 'medium',
        'status' => 'done',
        'due' => $yesterday,
        'completed' => $yesterday,
        'comments' => 2,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-012',
        'title' => 'Ежедневный отчёт РОПу',
        'description' => 'Сводка по заявкам и звонкам.',
        'assignee' => 'daniyar',
        'dept' => 'sales',
        'priority' => 'low',
        'status' => 'done',
        'due' => $yesterday,
        'completed' => $yesterday,
        'comments' => 0,
        'attachments' => 0,
    ],
    [
        'number' => 'DEMO-D-013',
        'title' => 'Инвентаризация зоны А',
        'description' => 'Частичная инвентаризация.',
        'assignee' => 'erlan',
        'dept' => 'warehouse',
        'priority' => 'medium',
        'status' => 'on_review',
        'due' => $today,
        'comments' => 1,
        'attachments' => 2,
    ],
    [
        'number' => 'DEMO-D-014',
        'title' => 'Подготовка к отправке партии',
        'description' => 'Документы и упаковка.',
        'assignee' => 'dinara',
        'dept' => 'operations',
        'priority' => 'high',
        'status' => 'in_progress',
        'due' => $tomorrow,
        'comments' => 0,
        'attachments' => 1,
    ],
    [
        'number' => 'DEMO-D-015',
        'title' => 'Настройка уведомлений дедлайнов',
        'description' => 'Порог напоминания 24 часа.',
        'assignee' => 'daniyar',
        'dept' => 'it',
        'priority' => 'low',
        'status' => 'new',
        'due' => $today->modify('+3 days'),
        'comments' => 0,
        'attachments' => 0,
    ],
];

// Extra tasks so KPI "today" looks dense like screenshot (~24)
for ($i = 16; $i <= 27; $i++) {
    $n = str_pad((string) $i, 3, '0', STR_PAD_LEFT);
    $assignees = ['daniyar', 'timur', 'erlan', 'arman', 'dinara'];
    $deptMap = [
        'daniyar' => 'sales',
        'timur' => 'sales',
        'erlan' => 'warehouse',
        'arman' => 'marketing',
        'dinara' => 'operations',
    ];
    $email = $assignees[($i - 16) % count($assignees)];
    $tasks[] = [
        'number' => "DEMO-D-{$n}",
        'title' => 'Рабочая задача #' . $i,
        'description' => 'Демо-задача для загрузки команды.',
        'assignee' => $email,
        'dept' => $deptMap[$email],
        'priority' => $i % 3 === 0 ? 'high' : 'medium',
        'status' => $i % 5 === 0 ? 'on_review' : 'in_progress',
        'due' => $today,
        'comments' => $i % 4,
        'attachments' => $i % 3 === 0 ? 1 : 0,
    ];
}

$insert = $pdo->prepare(
    'INSERT INTO tasks (number, title, description, creator_id, assignee_id, department_id, priority, status,
      starts_at, due_at, completed_at, comments_count, attachments_count)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
);

foreach ($tasks as $t) {
    $assigneeId = (int) $users[$t['assignee']]['id'];
    $deptId = (int) $depts[$t['dept']]['id'];
    $due = $t['due'] instanceof DateTimeInterface ? $t['due']->format('Y-m-d H:i:s') : null;
    $completed = isset($t['completed']) && $t['completed'] instanceof DateTimeInterface
        ? $t['completed']->format('Y-m-d H:i:s')
        : null;
    $insert->execute([
        $t['number'],
        $t['title'],
        $t['description'] ?? null,
        $aidar,
        $assigneeId,
        $deptId,
        $t['priority'],
        $t['status'],
        $now->modify('-2 days')->format('Y-m-d H:i:s'),
        $due,
        $completed,
        (int) ($t['comments'] ?? 0),
        (int) ($t['attachments'] ?? 0),
    ]);
    $taskId = (int) $pdo->lastInsertId();
    $pdo->prepare('INSERT IGNORE INTO task_assignees (task_id, user_id, position) VALUES (?, ?, 0)')->execute([$taskId, $assigneeId]);
    if (($t['comments'] ?? 0) > 0) {
        $pdo->prepare('INSERT INTO task_comments (task_id, user_id, body) VALUES (?,?,?)')
            ->execute([$taskId, $aidar, 'Демо-комментарий к задаче.']);
    }
    echo "task {$t['number']}: {$t['title']}\n";
}

$pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('demo_mode', 'true')
               ON DUPLICATE KEY UPDATE `value` = 'true'")->execute();

$count = (int) $pdo->query("SELECT COUNT(*) FROM tasks WHERE number LIKE 'DEMO-D-%'")->fetchColumn();
echo "seed_tasks done: {$count} demo tasks\n";
