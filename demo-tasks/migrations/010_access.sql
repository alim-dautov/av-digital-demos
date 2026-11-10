-- Access is owner or per-user modules. Demo role accounts are removed; the owner row stays.

ALTER TABLE users
  ADD COLUMN deleted_at DATETIME NULL AFTER is_active;

INSERT INTO roles (slug, name, description) VALUES
('employee', 'Сотрудник', 'Доступ только к отмеченным модулям')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description);

CREATE TABLE IF NOT EXISTS user_modules (
    user_id INT UNSIGNED NOT NULL,
    module VARCHAR(32) NOT NULL,
    PRIMARY KEY (user_id, module),
    CONSTRAINT fk_um_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @owner_id = (SELECT id FROM users WHERE email = 'aidar@demo.local' ORDER BY id LIMIT 1);

UPDATE tasks t
INNER JOIN users u ON u.id = t.creator_id
SET t.creator_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE tasks t
INNER JOIN users u ON u.id = t.assignee_id
SET t.assignee_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE task_comments c
INNER JOIN users u ON u.id = c.user_id
SET c.user_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE task_attachments a
INNER JOIN users u ON u.id = a.user_id
SET a.user_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE task_recurrences r
INNER JOIN users u ON u.id = r.assignee_id
SET r.assignee_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE task_recurrences r
INNER JOIN users u ON u.id = r.creator_id
SET r.creator_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE deals d
INNER JOIN users u ON u.id = d.owner_id
SET d.owner_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE quotes q
INNER JOIN users u ON u.id = q.author_id
SET q.author_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE sales_plans p
INNER JOIN users u ON u.id = p.user_id
SET p.user_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE clients c
INNER JOIN users u ON u.id = c.owner_id
SET c.owner_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE deal_events e
INNER JOIN users u ON u.id = e.user_id
SET e.user_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

UPDATE task_history h
INNER JOIN users u ON u.id = h.user_id
SET h.user_id = @owner_id
WHERE u.email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local')
  AND @owner_id IS NOT NULL;

DELETE FROM users
WHERE email IN ('rop@demo.local','ops@demo.local','warehouse@demo.local','manager@demo.local','it@demo.local','marketer@demo.local');

UPDATE users u
INNER JOIN roles r ON r.id = u.role_id
INNER JOIN roles e ON e.slug = 'employee'
SET u.role_id = e.id
WHERE r.slug <> 'owner';

INSERT IGNORE INTO user_modules (user_id, module)
SELECT u.id, m.module
FROM users u
JOIN (
    SELECT 'dashboard' AS module
    UNION ALL SELECT 'tasks'
    UNION ALL SELECT 'sales'
) m
WHERE u.username IN ('daniyar','timur','erlan','arman','dinara');

DELETE rp FROM role_permissions rp
INNER JOIN roles r ON r.id = rp.role_id
WHERE r.slug IN ('rop','marketer','ops_director','warehouse_director','manager','admin_it');

DELETE FROM roles
WHERE slug IN ('rop','marketer','ops_director','warehouse_director','manager','admin_it');
