<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use Trx\Database;
use Trx\Services\CrmService;

date_default_timezone_set('Asia/Almaty');

$pdo = Database::pdo();
$owner = $pdo->query("SELECT u.id, u.department_id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.slug = 'owner' LIMIT 1")->fetch(PDO::FETCH_ASSOC);
if (!$owner) {
    fwrite(STDERR, "Сначала scripts/seed.php\n");
    exit(1);
}
$user = [
    'user_id' => (int) $owner['id'],
    'role_slug' => 'owner',
    'department_id' => (int) $owner['department_id'],
];
$crm = new CrmService();
$sync = $crm->syncCatalog($user);
echo "catalog {$sync['synced']}\n";

$pdo->prepare("INSERT INTO knowledge_articles (topic, body, approved) VALUES ('оплата', 'не утверждено заказчиком', 0) ON DUPLICATE KEY UPDATE body = VALUES(body)")->execute();
$pdo->prepare("INSERT INTO knowledge_articles (topic, body, approved) VALUES ('доставка', 'не утверждено заказчиком', 0) ON DUPLICATE KEY UPDATE body = VALUES(body)")->execute();
$pdo->prepare("INSERT INTO settings (`key`, `value`) VALUES ('discount_threshold', '10'), ('schedule_open', '\"09:00\"'), ('schedule_close', '\"18:00\"'), ('score_completeness', '0.6') ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute();
echo "seed crm done\n";
