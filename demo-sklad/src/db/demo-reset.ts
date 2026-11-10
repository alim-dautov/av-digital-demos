/** Демо: полностью пересоздать схему и заново залить выдуманные данные. Только DEMO_MODE=1. */
import { sql } from "drizzle-orm";
import { getDb, migrateDb } from "./index";

export async function resetDemo() {
  if (process.env.DEMO_MODE !== "1") throw new Error("Сброс доступен только в демо-режиме");
  const db = await getDb();
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`create schema public`);
  await migrateDb();
  const { seed } = await import("./seed");
  await seed(db, { demo: true, password: process.env.SEED_PASSWORD || undefined });
}
