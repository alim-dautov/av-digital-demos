-- Login by username, phone in profile, forced password change for issued accounts
ALTER TABLE users
  ADD COLUMN username VARCHAR(64) NULL AFTER email,
  ADD COLUMN phone VARCHAR(32) NULL AFTER initials,
  ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
  ADD UNIQUE KEY uq_users_username (username);
