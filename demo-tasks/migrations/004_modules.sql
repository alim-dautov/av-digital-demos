-- Модули CRM: клиенты, сделки, заказы, каталог, КП, звонки, бот, агент.
-- Откат: migrations/down/004_modules.sql

CREATE TABLE IF NOT EXISTS clients (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(190) NOT NULL,
    company VARCHAR(190) NULL,
    phone VARCHAR(20) NOT NULL DEFAULT '',
    language VARCHAR(8) NOT NULL DEFAULT 'ru',
    owner_id INT UNSIGNED NULL,
    channels JSON NULL,
    is_demo TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_clients_phone (phone),
    CONSTRAINT fk_clients_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deals (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    number VARCHAR(32) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    client_id INT UNSIGNED NOT NULL,
    pipeline_id INT UNSIGNED NOT NULL,
    stage_id INT UNSIGNED NOT NULL,
    channel VARCHAR(32) NOT NULL DEFAULT 'offline',
    source VARCHAR(64) NOT NULL DEFAULT '',
    utm_source VARCHAR(64) NULL,
    utm_medium VARCHAR(64) NULL,
    utm_campaign VARCHAR(64) NULL,
    owner_id INT UNSIGNED NOT NULL,
    amount INT NOT NULL DEFAULT 0,
    client_replied TINYINT(1) NOT NULL DEFAULT 0,
    client_task VARCHAR(255) NULL,
    product_interest VARCHAR(255) NULL,
    requirements TEXT NULL,
    objection VARCHAR(255) NULL,
    next_contact_at DATETIME NULL,
    payment_terms VARCHAR(255) NULL,
    loss_reason VARCHAR(255) NULL,
    first_human_reply_at DATETIME NULL,
    sla_due_at DATETIME NULL,
    is_test TINYINT(1) NOT NULL DEFAULT 0,
    is_duplicate TINYINT(1) NOT NULL DEFAULT 0,
    is_demo TINYINT(1) NOT NULL DEFAULT 0,
    paid_on DATE NULL,
    last_activity_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_deals_stage (stage_id),
    KEY idx_deals_owner (owner_id),
    KEY idx_deals_created (created_at),
    CONSTRAINT fk_deals_client FOREIGN KEY (client_id) REFERENCES clients(id),
    CONSTRAINT fk_deals_pipeline FOREIGN KEY (pipeline_id) REFERENCES pipelines(id),
    CONSTRAINT fk_deals_stage FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id),
    CONSTRAINT fk_deals_owner FOREIGN KEY (owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deal_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_id INT UNSIGNED NOT NULL,
    event_key VARCHAR(128) NULL,
    kind VARCHAR(32) NOT NULL,
    body TEXT NULL,
    user_id INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_deal_event (deal_id, event_key),
    CONSTRAINT fk_de_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deal_stage_entries (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_id INT UNSIGNED NOT NULL,
    stage_id INT UNSIGNED NOT NULL,
    entered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_first_entry (deal_id, stage_id),
    CONSTRAINT fk_dse_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    onec_id VARCHAR(64) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(190) NOT NULL,
    unit VARCHAR(16) NOT NULL DEFAULT 'шт',
    characteristics TEXT NULL,
    min_price INT NOT NULL DEFAULT 0,
    price INT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'KZT',
    price_type VARCHAR(32) NOT NULL DEFAULT 'retail',
    synced_at DATETIME NULL,
    is_demo TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_products_onec (onec_id),
    UNIQUE KEY uq_products_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    product_id INT UNSIGNED NOT NULL,
    warehouse_code VARCHAR(32) NOT NULL,
    physical INT NOT NULL DEFAULT 0,
    reserved INT NOT NULL DEFAULT 0,
    available INT NOT NULL DEFAULT 0,
    synced_at DATETIME NULL,
    UNIQUE KEY uq_stock (product_id, warehouse_code),
    CONSTRAINT fk_stock_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deal_items (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_id INT UNSIGNED NOT NULL,
    product_id INT UNSIGNED NULL,
    sku VARCHAR(64) NOT NULL,
    name VARCHAR(190) NOT NULL,
    qty INT NOT NULL DEFAULT 1,
    unit VARCHAR(16) NOT NULL DEFAULT 'шт',
    price INT NOT NULL DEFAULT 0,
    discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    line_total INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_di_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
    CONSTRAINT fk_di_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS orders (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_id INT UNSIGNED NOT NULL,
    number VARCHAR(32) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    amount INT NOT NULL DEFAULT 0,
    paid_amount INT NOT NULL DEFAULT 0,
    delivery_status VARCHAR(32) NOT NULL DEFAULT 'none',
    onec_document_id VARCHAR(64) NULL,
    idempotency_key VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orders_idem (idempotency_key),
    CONSTRAINT fk_orders_deal FOREIGN KEY (deal_id) REFERENCES deals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id INT UNSIGNED NULL,
    deal_id INT UNSIGNED NOT NULL,
    amount INT NOT NULL,
    kind VARCHAR(16) NOT NULL,
    source VARCHAR(16) NOT NULL,
    paid_on DATE NOT NULL,
    evidence VARCHAR(255) NULL,
    confirmed_by INT UNSIGNED NULL,
    onec_document_id VARCHAR(64) NULL,
    idempotency_key VARCHAR(128) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pay_idem (idempotency_key),
    CONSTRAINT fk_pay_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
    CONSTRAINT fk_pay_deal FOREIGN KEY (deal_id) REFERENCES deals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quotes (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    deal_id INT UNSIGNED NOT NULL,
    number VARCHAR(32) NOT NULL,
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'draft',
    valid_until DATE NULL,
    discount_pct DECIMAL(5,2) NOT NULL DEFAULT 0,
    total INT NOT NULL DEFAULT 0,
    snapshot JSON NOT NULL,
    needs_approval TINYINT(1) NOT NULL DEFAULT 0,
    sent_at DATETIME NULL,
    sent_via VARCHAR(32) NULL,
    accepted_at DATETIME NULL,
    author_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_quote_ver (deal_id, version),
    CONSTRAINT fk_quotes_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE,
    CONSTRAINT fk_quotes_author FOREIGN KEY (author_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS calls (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    external_id VARCHAR(128) NOT NULL,
    direction VARCHAR(16) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    user_id INT UNSIGNED NULL,
    client_id INT UNSIGNED NULL,
    deal_id INT UNSIGNED NULL,
    started_at DATETIME NULL,
    connected_at DATETIME NULL,
    duration_sec INT NOT NULL DEFAULT 0,
    result VARCHAR(16) NOT NULL,
    recording_url VARCHAR(255) NULL,
    callback_task_id INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_calls_ext (external_id),
    CONSTRAINT fk_calls_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_calls_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_calls_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS call_analyses (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    call_id INT UNSIGNED NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    transcript JSON NULL,
    summary TEXT NULL,
    extracted JSON NULL,
    score JSON NULL,
    suggestions JSON NULL,
    error TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_analysis_call (call_id),
    CONSTRAINT fk_ca_call FOREIGN KEY (call_id) REFERENCES calls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    external_id VARCHAR(128) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    client_id INT UNSIGNED NULL,
    deal_id INT UNSIGNED NULL,
    direction VARCHAR(16) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'received',
    error TEXT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_msg_ext (channel, external_id),
    CONSTRAINT fk_msg_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_msg_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processed_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(32) NOT NULL,
    event_id VARCHAR(128) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_processed (source, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_spend (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    source VARCHAR(64) NOT NULL,
    period_month CHAR(7) NOT NULL,
    amount INT NOT NULL,
    confirmed_by INT UNSIGNED NULL,
    confirmed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_spend_user FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_plans (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    period_month CHAR(7) NOT NULL,
    metric VARCHAR(32) NOT NULL,
    target INT NOT NULL,
    changed_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_plan_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_plan_author FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_articles (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    topic VARCHAR(64) NOT NULL UNIQUE,
    body TEXT NOT NULL,
    approved TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bot_sessions (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    channel VARCHAR(32) NOT NULL,
    external_user VARCHAR(128) NOT NULL,
    client_id INT UNSIGNED NULL,
    deal_id INT UNSIGNED NULL,
    handed_off TINYINT(1) NOT NULL DEFAULT 0,
    handoff_reason VARCHAR(64) NULL,
    summary TEXT NULL,
    slots JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_bot_user (channel, external_user),
    CONSTRAINT fk_bot_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_bot_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bot_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session_id INT UNSIGNED NOT NULL,
    direction VARCHAR(16) NOT NULL,
    body TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_bm_session FOREIGN KEY (session_id) REFERENCES bot_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    role VARCHAR(16) NOT NULL,
    body TEXT NOT NULL,
    meta JSON NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_prefs (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    widget_order JSON NULL,
    motion TINYINT(1) NOT NULL DEFAULT 1,
    CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_history (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NULL,
    field_name VARCHAR(32) NOT NULL,
    old_value VARCHAR(255) NULL,
    new_value VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_th_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_checklist (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    task_id INT UNSIGNED NOT NULL,
    title VARCHAR(255) NOT NULL,
    is_done TINYINT(1) NOT NULL DEFAULT 0,
    sort_order INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_tcl_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    dedupe_key VARCHAR(190) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_notice (user_id, dedupe_key),
    CONSTRAINT fk_notice_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE tasks ADD COLUMN client_id INT UNSIGNED NULL;
ALTER TABLE tasks ADD COLUMN deal_id INT UNSIGNED NULL;
