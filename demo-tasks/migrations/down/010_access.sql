-- Restores role rows. Deleted demo accounts and their reassigned links are not rebuilt.

INSERT INTO roles (slug, name, description) VALUES
('rop', 'РОП', 'Продажи и команда продаж'),
('marketer', 'Маркетолог', 'Маркетинг и согласованные показатели продаж'),
('ops_director', 'Операционный директор', 'Операционные задачи и отчёты'),
('warehouse_director', 'Директор складов', 'Складские задачи и остатки'),
('manager', 'Менеджер', 'Назначенные сделки и задачи'),
('admin_it', 'Администратор IT', 'Настройки; бизнес-данные по разрешению')
ON DUPLICATE KEY UPDATE name = VALUES(name);

UPDATE users u
INNER JOIN roles e ON e.id = u.role_id AND e.slug = 'employee'
INNER JOIN roles m ON m.slug = 'manager'
SET u.role_id = m.id;

DROP TABLE IF EXISTS user_modules;

DELETE FROM roles WHERE slug = 'employee';

ALTER TABLE users DROP COLUMN deleted_at;
