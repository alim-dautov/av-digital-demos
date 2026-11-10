-- Files on task comments and comment editing.
-- Additive and idempotent: a new table plus a nullable column. Nothing is dropped or deleted.

CREATE TABLE IF NOT EXISTS task_comment_attachments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id BIGINT UNSIGNED NOT NULL,
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_path VARCHAR(255) NOT NULL,
    mime VARCHAR(127) NOT NULL,
    size INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_tca_comment (comment_id),
    KEY idx_tca_task (task_id),
    CONSTRAINT fk_tca_comment FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @demo_tc_edited := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'task_comments' AND COLUMN_NAME = 'edited_at');
SET @demo_tc_edited_sql := IF(@demo_tc_edited = 0, 'ALTER TABLE task_comments ADD COLUMN edited_at DATETIME NULL', 'SET @demo_tc_edited_done = 1');
PREPARE demo_tc_edited_stmt FROM @demo_tc_edited_sql;
EXECUTE demo_tc_edited_stmt;
DEALLOCATE PREPARE demo_tc_edited_stmt;
