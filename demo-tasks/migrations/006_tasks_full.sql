-- Block 1: full task card, attachments, templates, recurrences, in-app notifications

CREATE TABLE IF NOT EXISTS task_attachments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(255) NOT NULL,
    mime VARCHAR(127) NOT NULL,
    size INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ta_task (task_id),
    CONSTRAINT fk_ta_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_ta_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_templates (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    slug VARCHAR(64) NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    department_id INT UNSIGNED NOT NULL,
    priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
    checklist JSON NULL,
    due_in_hours INT UNSIGNED NOT NULL DEFAULT 8,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tt_dept FOREIGN KEY (department_id) REFERENCES departments(id),
    CONSTRAINT fk_tt_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_recurrences (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    template_id INT UNSIGNED NOT NULL,
    assignee_id INT UNSIGNED NOT NULL,
    creator_id INT UNSIGNED NOT NULL,
    rule ENUM('daily','weekly','monthly') NOT NULL,
    weekdays VARCHAR(16) NULL,
    month_day TINYINT UNSIGNED NULL,
    run_time TIME NOT NULL DEFAULT '09:00:00',
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    next_run_at DATETIME NOT NULL,
    last_run_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tr_next (is_active, next_run_at),
    CONSTRAINT fk_tr_tpl FOREIGN KEY (template_id) REFERENCES task_templates(id) ON DELETE CASCADE,
    CONSTRAINT fk_tr_assignee FOREIGN KEY (assignee_id) REFERENCES users(id),
    CONSTRAINT fk_tr_creator FOREIGN KEY (creator_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    kind VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body VARCHAR(500) NOT NULL DEFAULT '',
    url VARCHAR(255) NOT NULL DEFAULT '/',
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_user (user_id, read_at, id),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE user_prefs ADD COLUMN saved_filters JSON NULL;

ALTER TABLE tasks ADD COLUMN template_id INT UNSIGNED NULL;
ALTER TABLE tasks ADD COLUMN recurrence_id INT UNSIGNED NULL;
ALTER TABLE tasks ADD COLUMN recur_on DATE NULL;
ALTER TABLE tasks ADD UNIQUE KEY uq_task_recur (recurrence_id, recur_on);

INSERT INTO settings (`key`, `value`) VALUES
('task_remind_hours', '[24, 2]')
ON DUPLICATE KEY UPDATE `key` = `key`;

INSERT INTO task_templates (slug, title, description, department_id, priority, checklist, due_in_hours)
SELECT 'daily_report', 'Ежедневный отчёт', 'Итоги дня: заявки, оплаты, проблемы.', d.id, 'medium',
       JSON_ARRAY('Заявки за день', 'Оплаты за день', 'Проблемы и блокеры'), 9
FROM departments d WHERE d.slug = 'sales'
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO task_templates (slug, title, description, department_id, priority, checklist, due_in_hours)
SELECT 'chat_control', 'Контроль чатов', 'Проверить чаты без ответа и пропущенные обращения.', d.id, 'high',
       JSON_ARRAY('WhatsApp без ответа', 'Instagram без ответа', 'Пропущенные звонки'), 2
FROM departments d WHERE d.slug = 'sales'
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO task_templates (slug, title, description, department_id, priority, checklist, due_in_hours)
SELECT 'stock_check', 'Проверка остатков', 'Сверить остатки с 1С, отметить расхождения.', d.id, 'medium',
       JSON_ARRAY('Сверка с 1С', 'Расхождения записаны', 'Заказ пополнения при необходимости'), 6
FROM departments d WHERE d.slug = 'warehouse'
ON DUPLICATE KEY UPDATE title = VALUES(title);

INSERT INTO task_templates (slug, title, description, department_id, priority, checklist, due_in_hours)
SELECT 'shipment_prep', 'Подготовка к отправке', 'Собрать и проверить заказы к отгрузке.', d.id, 'high',
       JSON_ARRAY('Комплектация', 'Упаковка', 'Документы', 'Передача курьеру'), 6
FROM departments d WHERE d.slug = 'warehouse'
ON DUPLICATE KEY UPDATE title = VALUES(title);
