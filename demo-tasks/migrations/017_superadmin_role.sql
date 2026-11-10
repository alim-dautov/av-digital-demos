-- Superadmin role. Additive: inserts one role row if missing.
-- Does not touch existing users, roles or permissions.
-- The account itself is created at deploy time (password hash only, never in the repo).

INSERT INTO roles (slug, name, description) VALUES
('superadmin', 'Суперадмин', 'Полный доступ, скрытая служебная учётная запись')
ON DUPLICATE KEY UPDATE slug = slug;
