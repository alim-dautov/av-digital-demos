-- The "blocked" task status is removed from the product. Blocked tasks go back to work.
UPDATE tasks SET status = 'in_progress' WHERE status = 'blocked';

ALTER TABLE tasks DROP FOREIGN KEY fk_tasks_blocked_user;

ALTER TABLE tasks
  DROP COLUMN blocked_waiting_user_id,
  DROP COLUMN blocked_reason,
  MODIFY status ENUM('new','in_progress','on_review','done','cancelled') NOT NULL DEFAULT 'new';
