-- КП generator in the CRM: client contacts, line items, discount, notes, validity, number, stored PDF.
-- Additive and idempotent: each ADD COLUMN runs only when the column is missing. Nothing is dropped or deleted.

SET @demo_kp_number := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'number');
SET @demo_kp_number_sql := IF(@demo_kp_number = 0, 'ALTER TABLE kp_offers ADD COLUMN number VARCHAR(16) NULL', 'SET @demo_kp_number_done = 1');
PREPARE demo_kp_number_stmt FROM @demo_kp_number_sql;
EXECUTE demo_kp_number_stmt;
DEALLOCATE PREPARE demo_kp_number_stmt;

SET @demo_kp_client_phone := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'client_phone');
SET @demo_kp_client_phone_sql := IF(@demo_kp_client_phone = 0, 'ALTER TABLE kp_offers ADD COLUMN client_phone VARCHAR(64) NULL', 'SET @demo_kp_client_phone_done = 1');
PREPARE demo_kp_client_phone_stmt FROM @demo_kp_client_phone_sql;
EXECUTE demo_kp_client_phone_stmt;
DEALLOCATE PREPARE demo_kp_client_phone_stmt;

SET @demo_kp_client_company := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'client_company');
SET @demo_kp_client_company_sql := IF(@demo_kp_client_company = 0, 'ALTER TABLE kp_offers ADD COLUMN client_company VARCHAR(255) NULL', 'SET @demo_kp_client_company_done = 1');
PREPARE demo_kp_client_company_stmt FROM @demo_kp_client_company_sql;
EXECUTE demo_kp_client_company_stmt;
DEALLOCATE PREPARE demo_kp_client_company_stmt;

SET @demo_kp_items_json := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'items_json');
SET @demo_kp_items_json_sql := IF(@demo_kp_items_json = 0, 'ALTER TABLE kp_offers ADD COLUMN items_json MEDIUMTEXT NULL', 'SET @demo_kp_items_json_done = 1');
PREPARE demo_kp_items_json_stmt FROM @demo_kp_items_json_sql;
EXECUTE demo_kp_items_json_stmt;
DEALLOCATE PREPARE demo_kp_items_json_stmt;

SET @demo_kp_discount_type := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'discount_type');
SET @demo_kp_discount_type_sql := IF(@demo_kp_discount_type = 0, 'ALTER TABLE kp_offers ADD COLUMN discount_type VARCHAR(8) NULL', 'SET @demo_kp_discount_type_done = 1');
PREPARE demo_kp_discount_type_stmt FROM @demo_kp_discount_type_sql;
EXECUTE demo_kp_discount_type_stmt;
DEALLOCATE PREPARE demo_kp_discount_type_stmt;

SET @demo_kp_discount_value := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'discount_value');
SET @demo_kp_discount_value_sql := IF(@demo_kp_discount_value = 0, 'ALTER TABLE kp_offers ADD COLUMN discount_value DECIMAL(14,2) NULL', 'SET @demo_kp_discount_value_done = 1');
PREPARE demo_kp_discount_value_stmt FROM @demo_kp_discount_value_sql;
EXECUTE demo_kp_discount_value_stmt;
DEALLOCATE PREPARE demo_kp_discount_value_stmt;

SET @demo_kp_notes := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'notes');
SET @demo_kp_notes_sql := IF(@demo_kp_notes = 0, 'ALTER TABLE kp_offers ADD COLUMN notes TEXT NULL', 'SET @demo_kp_notes_done = 1');
PREPARE demo_kp_notes_stmt FROM @demo_kp_notes_sql;
EXECUTE demo_kp_notes_stmt;
DEALLOCATE PREPARE demo_kp_notes_stmt;

SET @demo_kp_valid_until := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'valid_until');
SET @demo_kp_valid_until_sql := IF(@demo_kp_valid_until = 0, 'ALTER TABLE kp_offers ADD COLUMN valid_until DATE NULL', 'SET @demo_kp_valid_until_done = 1');
PREPARE demo_kp_valid_until_stmt FROM @demo_kp_valid_until_sql;
EXECUTE demo_kp_valid_until_stmt;
DEALLOCATE PREPARE demo_kp_valid_until_stmt;

SET @demo_kp_pdf_path := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'pdf_path');
SET @demo_kp_pdf_path_sql := IF(@demo_kp_pdf_path = 0, 'ALTER TABLE kp_offers ADD COLUMN pdf_path VARCHAR(255) NULL', 'SET @demo_kp_pdf_path_done = 1');
PREPARE demo_kp_pdf_path_stmt FROM @demo_kp_pdf_path_sql;
EXECUTE demo_kp_pdf_path_stmt;
DEALLOCATE PREPARE demo_kp_pdf_path_stmt;

SET @demo_kp_pdf_generated_at := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kp_offers' AND COLUMN_NAME = 'pdf_generated_at');
SET @demo_kp_pdf_generated_at_sql := IF(@demo_kp_pdf_generated_at = 0, 'ALTER TABLE kp_offers ADD COLUMN pdf_generated_at DATETIME NULL', 'SET @demo_kp_pdf_generated_at_done = 1');
PREPARE demo_kp_pdf_generated_at_stmt FROM @demo_kp_pdf_generated_at_sql;
EXECUTE demo_kp_pdf_generated_at_stmt;
DEALLOCATE PREPARE demo_kp_pdf_generated_at_stmt;

-- Number existing offers by id (КП-0001 ...). Only fills empty numbers.
UPDATE kp_offers SET number = CONCAT('КП-', LPAD(id, 4, '0')), updated_at = updated_at WHERE number IS NULL;
