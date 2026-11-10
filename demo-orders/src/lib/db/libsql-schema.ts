export const LIBSQL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS mebeldemo_records (
    entity TEXT NOT NULL,
    record_id TEXT NOT NULL,
    company_id TEXT,
    payload TEXT NOT NULL,
    PRIMARY KEY (entity, record_id)
  )`,
  `CREATE INDEX IF NOT EXISTS mebeldemo_records_company_idx ON mebeldemo_records(company_id, entity)`,
  `CREATE TABLE IF NOT EXISTS mebeldemo_migration_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];
