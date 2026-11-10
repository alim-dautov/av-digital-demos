-- Regular tasks with required proof, KPI link (stage 2 computes the premium), holidays and vacations.
-- Additive only: existing tasks keep all flags at 0, so nothing changes for them.
ALTER TABLE task_templates
    ADD COLUMN requires_file TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN requires_photo TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN requires_checklist TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN kpi_key VARCHAR(64) NULL;

ALTER TABLE task_recurrences
    ADD COLUMN due_time TIME NULL,
    ADD COLUMN skip_non_working TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE tasks
    ADD COLUMN requires_file TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN requires_photo TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN requires_checklist TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN kpi_key VARCHAR(64) NULL,
    ADD COLUMN submitted_at DATETIME NULL,
    ADD KEY idx_tasks_kpi (kpi_key, recur_on);

CREATE TABLE IF NOT EXISTS kpi_indicators (
    kpi_key VARCHAR(64) NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    max_amount INT UNSIGNED NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO kpi_indicators (kpi_key, title, max_amount, sort_order) VALUES
    ('cash_day_close', 'Закрытие кассового дня', 15000, 1),
    ('cash_documents', 'Кассовые документы', 10000, 2),
    ('reporting', 'Отчётность', 10000, 3),
    ('office_manager', 'Офис-менеджер', 10000, 4),
    ('archive', 'Архив', 5000, 5);

CREATE TABLE IF NOT EXISTS holidays (
    day DATE NOT NULL PRIMARY KEY,
    title VARCHAR(255) NOT NULL DEFAULT '',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_vacations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    note VARCHAR(255) NOT NULL DEFAULT '',
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_vac_user (user_id, starts_on, ends_on),
    CONSTRAINT fk_vac_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
