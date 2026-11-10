/**
 * Подключение к БД. DATABASE_URL → PostgreSQL (node-postgres), иначе встроенная PGlite
 * (настоящий Postgres в WASM, данные в ./.data/pglite) для локальной разработки без Docker.
 * Соединение создаётся лениво — при первом обращении.
 */
import * as schema from "./schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import path from "node:path";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type G = { __demoDb?: Promise<DB>; __demoClose?: () => Promise<void>; __demoAnalyze?: () => Promise<unknown>; __demoAnalyzedAt?: number };
const g = globalThis as unknown as G;

async function create(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pg = (await import("pg")).default;
    // bigint/numeric → number
    pg.types.setTypeParser(20, (v: string) => Number(v));
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL ?? 10) });
    g.__demoClose = () => pool.end();
    return drizzle(pool, { schema }) as unknown as DB;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  let unlock = () => {};
  if (dir !== "memory") {
    (await import("node:fs")).mkdirSync(path.dirname(dir), { recursive: true });
    // Один процесс на папку: второй экземпляр приложения не должен писать в те же файлы
    if (process.env.PGLITE_LOCK !== "0") unlock = await (await import("./lock")).acquireDirLock(dir);
  }
  let client;
  try {
    client = dir === "memory" ? new PGlite() : new PGlite(dir);
    await client.waitReady;
  } catch (e) {
    unlock();
    throw e;
  }
  g.__demoClose = async () => {
    try {
      await client.close();
    } finally {
      unlock();
    }
  };
  g.__demoAnalyze = () => client.exec("analyze");
  // В PGlite нет autovacuum: без статистики планировщик считает таблицы пустыми и строит планы
  // с вложенными циклами (каталог в кабинете клиента — 25 с вместо 0,2 с). Обновляем при старте и периодически.
  await analyzeIfStale(0);
  return drizzle(client, { schema }) as unknown as DB;
}

/** PGlite: ANALYZE, если с прошлого прошло больше maxAgeMs (по умолчанию 6 часов). На PostgreSQL ничего не делает — там autovacuum. */
export async function analyzeIfStale(maxAgeMs = 6 * 3600_000) {
  if (!g.__demoAnalyze || Date.now() - (g.__demoAnalyzedAt ?? 0) < maxAgeMs) return;
  g.__demoAnalyzedAt = Date.now();
  try {
    await g.__demoAnalyze();
  } catch (e) {
    console.error("[db] analyze", e);
  }
}

export function getDb(): Promise<DB> {
  if (!g.__demoDb) {
    const p = create();
    g.__demoDb = p;
    p.catch((e) => {
      if (g.__demoDb === p) g.__demoDb = undefined; // следующий запрос попробует снова
      // Лишний экземпляр на хостинге: завершаемся, чтобы Passenger слал запросы владельцу базы
      if ((e as { code?: string }).code === "EDBBUSY" && process.env.NODE_ENV === "production") {
        console.error("[db]", (e as Error).message, "— процесс завершается");
        setTimeout(() => process.exit(0), 1000);
      }
    });
  }
  return g.__demoDb;
}

export async function closeDb() {
  if (g.__demoClose) await g.__demoClose();
  g.__demoDb = undefined;
  g.__demoClose = undefined;
  g.__demoAnalyze = undefined;
  g.__demoAnalyzedAt = undefined;
}

export async function migrateDb() {
  const db = await getDb();
  const folder = path.join(process.cwd(), "drizzle");
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    await migrate(db as never, { migrationsFolder: folder });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    await migrate(db as never, { migrationsFolder: folder });
  }
}

export { schema };
