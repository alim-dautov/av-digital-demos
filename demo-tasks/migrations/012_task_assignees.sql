-- Several responsible people per task and per recurring schedule.
-- tasks.assignee_id and task_recurrences.assignee_id stay (first responsible person).
-- Idempotent: CREATE TABLE IF NOT EXISTS and INSERT IGNORE can run again.
-- Does not drop columns, tables, or existing rows (including task_watchers).

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (task_id, user_id),
    KEY idx_task_assignees_user (user_id),
    CONSTRAINT fk_task_assignees_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_assignees_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_assignees (task_id, user_id, position)
SELECT id, assignee_id, 0 FROM tasks WHERE assignee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS task_recurrence_assignees (
    recurrence_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (recurrence_id, user_id),
    KEY idx_task_recurrence_assignees_user (user_id),
    CONSTRAINT fk_task_recurrence_assignees_rec FOREIGN KEY (recurrence_id) REFERENCES task_recurrences(id) ON DELETE CASCADE,
    CONSTRAINT fk_task_recurrence_assignees_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO task_recurrence_assignees (recurrence_id, user_id, position)
SELECT id, assignee_id, 0 FROM task_recurrences WHERE assignee_id IS NOT NULL;
