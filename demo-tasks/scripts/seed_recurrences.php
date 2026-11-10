<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;
use Trx\Domain\RecurrenceSchedule;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

$pdo = Database::pdo();
$userId = static function (string $username) use ($pdo): int {
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);

    return (int) $stmt->fetchColumn();
};
$templateId = static function (string $slug) use ($pdo): int {
    $stmt = $pdo->prepare('SELECT id FROM task_templates WHERE slug = ?');
    $stmt->execute([$slug]);

    return (int) $stmt->fetchColumn();
};

$owner = (int) $pdo->query("SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' ORDER BY u.id LIMIT 1")->fetchColumn();
$plan = [
    ['daily_report', 'daniyar', 'weekly', [1, 2, 3, 4, 5], null, '18:00'],
    ['chat_control', 'timur', 'daily', [], null, '10:00'],
    ['stock_check', 'erlan', 'weekly', [1], null, '09:00'],
    ['shipment_prep', 'arman', 'weekly', [1, 2, 3, 4, 5], null, '14:00'],
];

$exists = $pdo->prepare('SELECT 1 FROM task_recurrences WHERE template_id = ? AND assignee_id = ?');
$insert = $pdo->prepare(
    'INSERT INTO task_recurrences (template_id, assignee_id, creator_id, rule, weekdays, month_day, run_time, next_run_at)
     VALUES (?,?,?,?,?,?,?,?)'
);
foreach ($plan as [$slug, $username, $rule, $weekdays, $monthDay, $time]) {
    $tpl = $templateId($slug);
    $assignee = $userId($username);
    if ($tpl === 0 || $assignee === 0 || $owner === 0) {
        echo "skip {$slug}: run migrations first\n";
        continue;
    }
    $exists->execute([$tpl, $assignee]);
    if ($exists->fetchColumn()) {
        echo "exists {$slug}\n";
        continue;
    }
    $next = RecurrenceSchedule::next($rule, $weekdays, $monthDay, $time . ':00', new DateTimeImmutable('now'));
    $insert->execute([$tpl, $assignee, $owner, $rule, $weekdays ? implode(',', $weekdays) : null, $monthDay, $time . ':00', $next->format('Y-m-d H:i:s')]);
    $pdo->prepare('INSERT IGNORE INTO task_recurrence_assignees (recurrence_id, user_id, position) VALUES (?,?,0)')
        ->execute([(int) $pdo->lastInsertId(), $assignee]);
    echo "recurrence {$slug} -> {$username}, next {$next->format('Y-m-d H:i')}\n";
}
echo "seed recurrences done\n";
