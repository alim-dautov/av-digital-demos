-- @mentions in task comments: who was mentioned and whether they have opened the task since.
CREATE TABLE IF NOT EXISTS task_mentions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    comment_id BIGINT UNSIGNED NOT NULL,
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    read_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_mention_comment_user (comment_id, user_id),
    KEY idx_mention_user_unread (user_id, read_at),
    KEY idx_mention_task_user (task_id, user_id),
    CONSTRAINT fk_mention_comment FOREIGN KEY (comment_id) REFERENCES task_comments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
