-- «КП»: commercial offers created in the CRM or via /api/kp. Additive.
CREATE TABLE IF NOT EXISTS kp_offers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    client_name VARCHAR(255) NOT NULL,
    amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    details TEXT NULL,
    pdf_url VARCHAR(1000) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'draft',
    author_user_id INT UNSIGNED NULL,
    author_token_name VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY kp_offers_created (created_at),
    KEY kp_offers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
