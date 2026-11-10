-- Monotonic optimistic-lock version per employee/day for manual timesheet codes. Additive only.
-- Kept separately from attendance_day_codes so the version survives a cleared code (tombstone):
-- a cleared day never returns to the initial «none» token, and A→B→A always yields a new token.
CREATE TABLE IF NOT EXISTS attendance_day_code_versions (
    user_id INT UNSIGNED NOT NULL,
    work_date DATE NOT NULL,
    version INT UNSIGNED NOT NULL,
    PRIMARY KEY (user_id, work_date),
    CONSTRAINT fk_att_code_ver_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes created before this migration (local/dev only; 030 is not deployed) start at version 1.
INSERT IGNORE INTO attendance_day_code_versions (user_id, work_date, version)
SELECT user_id, work_date, 1 FROM attendance_day_codes;
