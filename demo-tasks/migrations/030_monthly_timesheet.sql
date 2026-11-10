-- Monthly timesheet (customer template): additive only. Nothing existing is dropped or rewritten.
-- Compatible with MariaDB 10.4+ / MySQL 8: stored generated column, JSON functions, CONVERT_TZ with numeric offsets.

SET @demo_ts_has_pos := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'position'
);

SET @demo_ts_pos_sql := IF(
    @demo_ts_has_pos = 0,
    'ALTER TABLE users ADD COLUMN position VARCHAR(128) NULL AFTER name',
    'SET @demo_ts_pos_done = 1'
);

PREPARE demo_ts_pos_stmt FROM @demo_ts_pos_sql;

EXECUTE demo_ts_pos_stmt;

DEALLOCATE PREPARE demo_ts_pos_stmt;

-- Requisites start blank (template placeholder «ИП  _______» stays). Archive starts with the deploy month (UTC+5): no backfill before the feature.
INSERT IGNORE INTO settings (`key`, `value`) VALUES
('timesheet_requisites', JSON_OBJECT('org_title', '')),
('timesheet_archive_from', JSON_QUOTE(DATE_FORMAT(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+05:00'), '%Y-%m')));

CREATE TABLE IF NOT EXISTS attendance_keepers (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    granted_by INT UNSIGNED NOT NULL,
    granted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_att_keeper_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_day_codes (
    user_id INT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    code ENUM('Б','О','А','К','П','Р','Д','В') NOT NULL,
    comment VARCHAR(500) NULL,
    set_by INT UNSIGNED NOT NULL,
    set_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, work_date),
    KEY idx_att_code_date (work_date),
    CONSTRAINT fk_att_code_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per saved revision. Revisions are never reused; only one live (pending/ready) auto row per period.
CREATE TABLE IF NOT EXISTS attendance_timesheet_archives (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    period CHAR(7) NOT NULL,
    revision SMALLINT UNSIGNED NOT NULL,
    kind ENUM('auto','manual') NOT NULL,
    status ENUM('pending','ready','failed') NOT NULL DEFAULT 'pending',
    auto_guard TINYINT AS (IF(kind = 'auto' AND status <> 'failed', 1, NULL)) STORED,
    file_rel VARCHAR(255) NOT NULL,
    sha256 CHAR(64) NOT NULL,
    size INT UNSIGNED NOT NULL,
    employees INT UNSIGNED NOT NULL,
    incomplete_days INT UNSIGNED NOT NULL,
    conflicts INT UNSIGNED NOT NULL,
    error VARCHAR(255) NULL,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    UNIQUE KEY uq_tsa_rev (period, revision),
    UNIQUE KEY uq_tsa_auto (period, auto_guard),
    KEY idx_tsa_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
