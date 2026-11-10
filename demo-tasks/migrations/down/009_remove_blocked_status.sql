ALTER TABLE tasks
  MODIFY status ENUM('new','in_progress','blocked','on_review','done','cancelled') NOT NULL DEFAULT 'new',
  ADD COLUMN blocked_reason VARCHAR(255) NULL AFTER status,
  ADD COLUMN blocked_waiting_user_id INT UNSIGNED NULL AFTER blocked_reason;

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_blocked_user FOREIGN KEY (blocked_waiting_user_id) REFERENCES users(id) ON DELETE SET NULL;
