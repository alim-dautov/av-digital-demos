-- Manual local rollback only. NEVER run on production. Fails if preparation-failure rows (NULL hash) exist.
ALTER TABLE attendance_timesheet_archives DROP CONSTRAINT chk_tsa_ready_integrity;
ALTER TABLE attendance_timesheet_archives
    MODIFY sha256 CHAR(64) NOT NULL,
    MODIFY size INT UNSIGNED NOT NULL,
    MODIFY employees INT UNSIGNED NOT NULL,
    MODIFY incomplete_days INT UNSIGNED NOT NULL,
    MODIFY conflicts INT UNSIGNED NOT NULL;
