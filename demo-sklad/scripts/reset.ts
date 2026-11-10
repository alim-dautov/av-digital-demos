import { rm } from "node:fs/promises";
if (process.env.DATABASE_URL) {
  console.error("reset работает только со встроенной PGlite. Для PostgreSQL пересоздайте БД вручную.");
  process.exit(1);
}
await rm(".data/pglite", { recursive: true, force: true });
console.log("✓ Локальная БД удалена. Запустите npm run setup");
