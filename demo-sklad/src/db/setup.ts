/**
 * Автонастройка БД при старте (DB_AUTO_SETUP=1) — для хостингов без SSH (cPanel).
 * Применяет миграции и, если пользователей ещё нет, создаёт сотрудников и справочники без демо-данных.
 * Временные пароли пишутся в .data/initial-passwords.txt (забрать по FTP и удалить).
 * На PostgreSQL выполняется под advisory-lock, чтобы несколько процессов Passenger не мигрировали одновременно.
 */
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { analyzeIfStale, getDb, migrateDb } from "./index";

const LOCK_ID = 774_201_001;

export async function autoSetup() {
  const db = await getDb();
  const pg = !!process.env.DATABASE_URL;
  if (pg) await db.execute(sql`select pg_advisory_lock(${LOCK_ID})`);
  try {
    await migrateDb();
    const { seed } = await import("./seed");
    const res = await seed(db, { demo: process.env.DEMO_MODE === "1", password: process.env.SEED_PASSWORD || undefined });
    if (!res.skipped) {
      const dir = path.join(process.cwd(), ".data");
      await mkdir(dir, { recursive: true });
      const lines = Object.entries(res.passwords).map(([l, p]) => `${l.padEnd(10)} ${p}`).join("\n");
      await writeFile(path.join(dir, "initial-passwords.txt"), `Временные пароли (обязательная смена при первом входе)\n\n${lines}\n`);
      console.log("[setup] БД создана, временные пароли: .data/initial-passwords.txt");
    } else console.log("[setup] миграции применены");
    await analyzeIfStale(0);
  } finally {
    if (pg) await db.execute(sql`select pg_advisory_unlock(${LOCK_ID})`);
  }
}
