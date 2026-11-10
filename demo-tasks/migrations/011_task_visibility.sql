-- Optional department on tasks, and a per-employee flag to see every task.
-- Idempotent for MySQL/MariaDB: ADD COLUMN is guarded, MODIFY NULL can run again.

SET @demo_see_all := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'see_all_tasks'
);

SET @demo_see_all_sql := IF(
    @demo_see_all = 0,
    'ALTER TABLE users ADD COLUMN see_all_tasks TINYINT(1) NOT NULL DEFAULT 0',
    'SELECT 1'
);

PREPARE demo_see_all_stmt FROM @demo_see_all_sql;

EXECUTE demo_see_all_stmt;

DEALLOCATE PREPARE demo_see_all_stmt;

ALTER TABLE tasks MODIFY COLUMN department_id INT UNSIGNED NULL;

ALTER TABLE task_templates MODIFY COLUMN department_id INT UNSIGNED NULL;
