-- Archive attempts that fail during preparation (model/renderer/template) are persisted as `failed`
-- with their own never-reused revision but WITHOUT hash/size/counts (NULL = unknown, never a fake value).
-- A `ready` revision must always carry a real hash and size. Additive relaxation only.
-- Replay-safe: if the process dies after the DDL but before schema_migrations is written, a rerun must
-- not fail. MODIFY to the same definition is idempotent; the named CHECK is added only when absent
-- (information_schema.TABLE_CONSTRAINTS: MariaDB >= 10.2, MySQL >= 8.0.16). PREPARE/EXECUTE kept on separate lines.
ALTER TABLE attendance_timesheet_archives
    MODIFY sha256 CHAR(64) NULL,
    MODIFY size INT UNSIGNED NULL,
    MODIFY employees INT UNSIGNED NULL,
    MODIFY incomplete_days INT UNSIGNED NULL,
    MODIFY conflicts INT UNSIGNED NULL;

SET @demo_tsa_chk_has := (
    SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_timesheet_archives'
      AND CONSTRAINT_NAME = 'chk_tsa_ready_integrity' AND CONSTRAINT_TYPE = 'CHECK'
);

SET @demo_tsa_chk_sql := IF(
    @demo_tsa_chk_has = 0,
    'ALTER TABLE attendance_timesheet_archives ADD CONSTRAINT chk_tsa_ready_integrity CHECK (status <> ''ready'' OR (sha256 IS NOT NULL AND size IS NOT NULL))',
    'SET @demo_tsa_chk_done = 1'
);

PREPARE demo_tsa_chk_stmt FROM @demo_tsa_chk_sql;

EXECUTE demo_tsa_chk_stmt;

DEALLOCATE PREPARE demo_tsa_chk_stmt;
