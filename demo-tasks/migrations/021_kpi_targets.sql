-- «KPI»: plan and fact per employee per month (period = YYYY-MM). Owner edits in Settings. Additive.
CREATE TABLE IF NOT EXISTS kpi_targets (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    period CHAR(7) NOT NULL,
    plan DECIMAL(14,2) NOT NULL DEFAULT 0,
    fact DECIMAL(14,2) NOT NULL DEFAULT 0,
    updated_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY kpi_targets_user_period (user_id, period),
    KEY kpi_targets_period (period)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
