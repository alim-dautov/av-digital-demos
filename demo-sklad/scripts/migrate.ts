import { migrateDb, closeDb } from "../src/db";
await migrateDb();
console.log("✓ Миграции применены");
await closeDb();
