-- API key scope: full = old behaviour (every existing token becomes full), kp = only /api/kp*.
-- Idempotent and additive: ADD COLUMN runs only when the column is missing. Nothing is dropped.

SET @demo_tok_scope := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_tokens' AND COLUMN_NAME = 'scope'
);

SET @demo_tok_scope_sql := IF(
    @demo_tok_scope = 0,
    'ALTER TABLE api_tokens ADD COLUMN scope VARCHAR(16) NOT NULL DEFAULT ''full'' AFTER name',
    'SET @demo_tok_scope_done = 1'
);

PREPARE demo_tok_scope_stmt FROM @demo_tok_scope_sql;

EXECUTE demo_tok_scope_stmt;

DEALLOCATE PREPARE demo_tok_scope_stmt;
