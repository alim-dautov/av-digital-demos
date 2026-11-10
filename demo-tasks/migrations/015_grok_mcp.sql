-- Grok Bot: mini-chat, MCP call log, meetings, cash, outgoing message log.
-- Idempotent: CREATE TABLE IF NOT EXISTS can run again.
-- Does not remove columns, tables, or existing rows.

CREATE TABLE IF NOT EXISTS mini_chat_messages (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNSIGNED NOT NULL,
    command_id CHAR(36) NOT NULL,
    role ENUM('user','assistant') NOT NULL,
    body TEXT NOT NULL,
    delivery_status VARCHAR(16) NOT NULL DEFAULT 'pending',
    delivery_error VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mini_chat_user (user_id, id),
    KEY idx_mini_chat_command (user_id, command_id),
    CONSTRAINT fk_mini_chat_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mcp_call_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token_id INT UNSIGNED NULL,
    user_id INT UNSIGNED NULL,
    tool_name VARCHAR(64) NOT NULL,
    ok TINYINT(1) NOT NULL,
    duration_ms INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_mcp_log_token (token_id, id),
    KEY idx_mcp_log_created (created_at),
    CONSTRAINT fk_mcp_log_token FOREIGN KEY (token_id) REFERENCES api_tokens(id) ON DELETE SET NULL,
    CONSTRAINT fk_mcp_log_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meetings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NULL,
    location VARCHAR(255) NULL,
    notes TEXT NULL,
    client_id INT UNSIGNED NULL,
    organizer_id INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_meetings_start (starts_at),
    CONSTRAINT fk_meetings_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_meetings_organizer FOREIGN KEY (organizer_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_participants (
    meeting_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (meeting_id, user_id),
    CONSTRAINT fk_mp_meeting FOREIGN KEY (meeting_id) REFERENCES meetings(id) ON DELETE CASCADE,
    CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_operations (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    kind ENUM('income','expense') NOT NULL,
    amount INT UNSIGNED NOT NULL,
    occurred_on DATE NOT NULL,
    comment VARCHAR(255) NULL,
    client_id INT UNSIGNED NULL,
    created_by INT UNSIGNED NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cash_date (occurred_on, kind),
    CONSTRAINT fk_cash_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_cash_user FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outgoing_message_log (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    contact_id INT UNSIGNED NOT NULL,
    channel VARCHAR(32) NOT NULL,
    body TEXT NOT NULL,
    status VARCHAR(32) NOT NULL,
    logged_by INT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_outgoing_contact (contact_id, id),
    CONSTRAINT fk_outgoing_contact FOREIGN KEY (contact_id) REFERENCES users(id),
    CONSTRAINT fk_outgoing_logger FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
