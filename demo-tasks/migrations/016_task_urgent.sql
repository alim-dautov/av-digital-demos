-- Urgent flag on tasks. Existing rows stay, with is_urgent = 0.
-- Idempotent: ADD COLUMN runs only when the column is missing.
-- Does not drop columns, tables, or existing rows.

SET @demo_task_urgent := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tasks' AND COLUMN_NAME = 'is_urgent'
);

SET @demo_task_urgent_sql := IF(
    @demo_task_urgent = 0,
    'ALTER TABLE tasks ADD COLUMN is_urgent TINYINT NOT NULL DEFAULT 0',
    'SET @demo_task_urgent_done = 1'
);

PREPARE demo_task_urgent_stmt FROM @demo_task_urgent_sql;

EXECUTE demo_task_urgent_stmt;

DEALLOCATE PREPARE demo_task_urgent_stmt;
