<?php

declare(strict_types=1);

/**
 * Wipes working data (tasks, deals, clients, calls, notifications, logs) and keeps
 * accounts, sessions, roles, departments, pipeline, settings, system templates and catalog.
 *
 * Usage: php scripts/reset_data.php --yes
 */
require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Config;
use Trx\Database;

date_default_timezone_set((string) Config::get('app.timezone', 'Asia/Almaty'));

if (!in_array('--yes', $argv ?? [], true)) {
    fwrite(STDERR, "Deletes all tasks, deals, clients and logs. Accounts are kept. Re-run with --yes to confirm.\n");
    exit(1);
}

const DATA_TABLES = [
    'task_attachments', 'task_checklist', 'task_comments', 'task_history', 'task_watchers', 'task_assignees', 'task_reads', 'tasks',
    'task_recurrence_assignees', 'task_recurrences',
    'call_analyses', 'calls', 'bot_messages', 'bot_sessions', 'messages',
    'payments', 'orders', 'quotes', 'deal_events', 'deal_items', 'deal_stage_entries', 'deals', 'clients',
    'notifications', 'notification_log', 'jobs', 'outbox_entries', 'processed_events', 'idempotency_keys',
    'agent_messages', 'audit_log', 'login_attempts', 'marketing_spend', 'sales_plans',
];

$pdo = Database::pdo();
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
try {
    foreach (DATA_TABLES as $table) {
        $count = $pdo->exec("DELETE FROM `{$table}`");
        $pdo->exec("ALTER TABLE `{$table}` AUTO_INCREMENT = 1");
        echo "{$table}: {$count}\n";
    }
    $count = $pdo->exec('DELETE FROM task_templates WHERE slug IS NULL');
    echo "task_templates (custom): {$count}\n";
    $pdo->exec("UPDATE settings SET `value` = '0' WHERE `key` = 'assignment_cursor'");
} finally {
    $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
}

$users = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
echo "done, accounts kept: {$users}\n";
