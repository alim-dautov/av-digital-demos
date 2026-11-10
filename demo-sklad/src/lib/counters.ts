import { sql } from "drizzle-orm";
import type { DB } from "@/db";

/** Атомарно выдаёт следующий номер документа по ключу */
export async function nextNumber(db: DB, key: string): Promise<number> {
  const res = await db.execute<{ value: number }>(sql`
    insert into counters (key, value) values (${key}, 1)
    on conflict (key) do update set value = counters.value + 1
    returning value`);
  const rows = (res as unknown as { rows: { value: number }[] }).rows ?? (res as unknown as { value: number }[]);
  return Number(rows[0].value);
}
