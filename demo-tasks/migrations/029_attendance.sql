-- Attendance by QR. Additive only: one new role row and three new tables. Existing data is not touched.
INSERT INTO roles (slug, name, description) VALUES
('attendance_display', 'Экран QR', 'Только показ QR посещаемости')
ON DUPLICATE KEY UPDATE slug = slug;

CREATE TABLE IF NOT EXISTS attendance_displays (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    name VARCHAR(128) NOT NULL,
    secret_enc TEXT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME NULL,
    UNIQUE KEY uq_att_display_user (user_id),
    CONSTRAINT fk_att_display_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    kind ENUM('in','out') NOT NULL,
    epoch BIGINT UNSIGNED NOT NULL,
    display_id INT UNSIGNED NOT NULL,
    occurred_at_utc DATETIME NOT NULL,
    ip VARCHAR(45) NULL,
    user_agent VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_att_event_user_epoch (user_id, epoch),
    KEY idx_att_event_time (occurred_at_utc),
    CONSTRAINT fk_att_event_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_att_event_display FOREIGN KEY (display_id) REFERENCES attendance_displays(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_shifts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    in_at_utc DATETIME NOT NULL,
    out_at_utc DATETIME NULL,
    in_event_id BIGINT UNSIGNED NULL,
    out_event_id BIGINT UNSIGNED NULL,
    status ENUM('open','closed','incomplete') NOT NULL DEFAULT 'open',
    open_guard TINYINT AS (IF(status = 'open', 1, NULL)) STORED,
    edited_by INT UNSIGNED NULL,
    edited_at DATETIME NULL,
    edit_comment VARCHAR(500) NULL,
    UNIQUE KEY uq_att_shift_open (user_id, open_guard),
    KEY idx_att_shift_date (work_date, user_id),
    CONSTRAINT fk_att_shift_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
