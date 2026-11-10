-- Last successful login time, shown in the «Команда» profile. Set by AuthService::login.
-- Idempotent and additive: ADD COLUMN runs only when the column is missing. Nothing is dropped.

SET @demo_last_login := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_login_at'
);

SET @demo_last_login_sql := IF(
    @demo_last_login = 0,
    'ALTER TABLE users ADD COLUMN last_login_at DATETIME NULL',
    'SET @demo_last_login_done = 1'
);

PREPARE demo_last_login_stmt FROM @demo_last_login_sql;

EXECUTE demo_last_login_stmt;

DEALLOCATE PREPARE demo_last_login_stmt;
