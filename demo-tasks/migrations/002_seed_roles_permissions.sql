-- Roles, permissions, departments (reference data; users come from seed script)

INSERT INTO departments (slug, name, color, icon, sort_order) VALUES
('sales', 'Продажи', '#FF5A1F', 'chart', 10),
('operations', 'Операции', '#22C55E', 'gear', 20),
('warehouse', 'Склад', '#3B82F6', 'cube', 30),
('marketing', 'Маркетинг', '#A855F7', 'megaphone', 40),
('it', 'IT', '#14B8A6', 'code', 50),
('management', 'Управление', '#22D3EE', 'briefcase', 5)
ON DUPLICATE KEY UPDATE name = VALUES(name), color = VALUES(color), icon = VALUES(icon);

INSERT INTO roles (slug, name, description) VALUES
('owner', 'Владелец', 'Айдар — полный доступ'),
('rop', 'РОП', 'Продажи и команда продаж'),
('marketer', 'Маркетолог', 'Маркетинг и согласованные показатели продаж'),
('ops_director', 'Операционный директор', 'Операционные задачи и отчёты'),
('warehouse_director', 'Директор складов', 'Складские задачи и остатки'),
('manager', 'Менеджер', 'Назначенные сделки и задачи'),
('admin_it', 'Администратор IT', 'Настройки; бизнес-данные по разрешению')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO permissions (resource, action) VALUES
('dashboard', 'view'),
('tasks', 'view'),
('tasks', 'update'),
('tasks', 'delete'),
('tasks', 'export'),
('sales', 'view'),
('sales', 'update'),
('sales', 'delete'),
('sales', 'export'),
('team', 'view'),
('warehouse', 'view'),
('warehouse', 'update'),
('reports', 'view'),
('reports', 'export'),
('settings', 'view'),
('settings', 'update'),
('cost', 'view'),
('calls', 'view'),
('agent', 'view')
ON DUPLICATE KEY UPDATE action = VALUES(action);

-- Owner: all permissions
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.slug = 'owner';

-- ROP / marketer: sales + team + reports view/export + tasks
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
    (p.resource IN ('dashboard','tasks','sales','team','reports') AND p.action IN ('view','update','export'))
    OR (p.resource = 'tasks' AND p.action = 'delete')
)
WHERE r.slug IN ('rop', 'marketer');

-- Ops director
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
    p.resource IN ('dashboard','tasks','team','reports') AND p.action IN ('view','update','export')
)
WHERE r.slug = 'ops_director';

-- Warehouse director
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
    (p.resource IN ('dashboard','tasks','warehouse','reports') AND p.action IN ('view','update','export'))
)
WHERE r.slug = 'warehouse_director';

-- Manager: limited
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
    (p.resource IN ('dashboard','tasks','sales') AND p.action IN ('view','update'))
)
WHERE r.slug = 'manager';

-- Admin IT: settings + dashboard; business data granted separately later
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (
    (p.resource IN ('dashboard','settings') AND p.action IN ('view','update'))
    OR (p.resource = 'tasks' AND p.action = 'view')
)
WHERE r.slug = 'admin_it';

INSERT INTO settings (`key`, `value`) VALUES
('demo_mode', 'true'),
('deadline_reminder_hours', '24')
ON DUPLICATE KEY UPDATE `value` = VALUES(`value`);

INSERT INTO pipelines (id, name, is_default, is_active) VALUES
(1, 'Прямые продажи', 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO pipeline_stages (pipeline_id, slug, name, sort_order, is_won, is_lost, require_loss_reason) VALUES
(1, 'new_lead', 'Новая заявка', 10, 0, 0, 0),
(1, 'contact_made', 'Контакт установлен', 20, 0, 0, 0),
(1, 'need_defined', 'Потребность определена', 30, 0, 0, 0),
(1, 'proposal_sent', 'Предложение отправлено', 40, 0, 0, 0),
(1, 'negotiation', 'Согласование', 50, 0, 0, 0),
(1, 'awaiting_payment', 'Ожидание оплаты', 60, 0, 0, 0),
(1, 'won', 'Успешно реализовано', 70, 1, 0, 0),
(1, 'lost', 'Закрыто без продажи', 80, 0, 1, 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), sort_order = VALUES(sort_order);
