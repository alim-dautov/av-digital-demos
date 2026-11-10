-- KPI stage 2: salaries, manual adjustments, approved (frozen) months. Additive only.
CREATE TABLE IF NOT EXISTS employee_salaries (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    salary DECIMAL(14,2) NOT NULL DEFAULT 0,
    updated_by INT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_employee_salaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_adjustments (
    period CHAR(7) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    amount INT NOT NULL DEFAULT 0,
    comment VARCHAR(500) NOT NULL,
    created_by INT UNSIGNED NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (period, user_id),
    CONSTRAINT fk_kpi_adjustments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kpi_periods (
    period CHAR(7) NOT NULL PRIMARY KEY,
    status VARCHAR(16) NOT NULL DEFAULT 'open',
    snapshot LONGTEXT NULL,
    approved_by INT UNSIGNED NULL,
    approved_at DATETIME NULL,
    reopened_by INT UNSIGNED NULL,
    reopened_at DATETIME NULL,
    reopen_reason VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
