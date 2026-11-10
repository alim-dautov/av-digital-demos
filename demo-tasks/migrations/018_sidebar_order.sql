-- Per-user sidebar order (Settings → «Боковое меню»). NULL = default order.
-- Idempotent: ADD COLUMN runs only when the column is missing. Does not drop anything.

SET @demo_sidebar_order := (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_prefs' AND COLUMN_NAME = 'sidebar_order'
);

SET @demo_sidebar_order_sql := IF(
    @demo_sidebar_order = 0,
    'ALTER TABLE user_prefs ADD COLUMN sidebar_order TEXT NULL',
    'SET @demo_sidebar_order_done = 1'
);

PREPARE demo_sidebar_order_stmt FROM @demo_sidebar_order_sql;

EXECUTE demo_sidebar_order_stmt;

DEALLOCATE PREPARE demo_sidebar_order_stmt;
