-- A task is new for a responsible user until that user opens the task card.
-- Existing assignee pairs are marked seen so the badge starts at zero.
-- Idempotent: CREATE TABLE IF NOT EXISTS and INSERT IGNORE can run again.
-- Does not drop columns, tables, or existing rows.

CREATE TABLE IF NOT EXISTS task_reads (
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (task_id, user_id),
    KEY idx_task_reads_user (user_id),
    CONSTRAINT fk_task_reads_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_reads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_reads (task_id, user_id)
SELECT task_id, user_id FROM task_assignees;

INSERT IGNORE INTO task_reads (task_id, user_id)
SELECT id, assignee_id FROM tasks WHERE assignee_id IS NOT NULL;
