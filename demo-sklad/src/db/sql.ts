import type { SQL } from "drizzle-orm";
import type { DB } from "./index";

/** Выполнить сырой SQL и вернуть строки (одинаково для pg и PGlite) */
export async function q<T = Record<string, unknown>>(db: DB, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}
export async function q1<T = Record<string, unknown>>(db: DB, query: SQL): Promise<T | undefined> {
  return (await q<T>(db, query))[0];
}
