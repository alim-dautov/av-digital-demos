import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { inventories, inventoryItems, products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { today } from "@/lib/format";
import { stockSql } from "@/modules/stock/queries";
import { defaultWarehouse } from "@/modules/shipments/service";

export const inventoryInput = z.object({
  date: z.string().default(() => today()),
  comment: z.string().default(""),
  post: z.boolean().default(false),
  items: z.array(z.object({ productId: z.number().int(), actual: z.number().min(0) })).min(1, "Добавьте позиции"),
});

/** Инвентаризация: фиксируем учётный остаток на дату и фактический; разница корректирует остаток */
export async function createInventory(db: DB, p: Principal, input: z.infer<typeof inventoryInput>) {
  assertCan(p, "stock", "full");
  const wh = await defaultWarehouse(db);
  const ids = input.items.map((i) => i.productId);
  const st = await q<{ product_id: number; qty: number }>(db, sql`select product_id, qty from ${stockSql(input.date, wh)} s
    where s.product_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
  const sm = new Map(st.map((s) => [s.product_id, Number(s.qty)]));
  return db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const number = await nextNumber(tx, "inventory");
    const [inv] = await tx.insert(inventories).values({ number, warehouseId: wh, date: input.date, posted: input.post, comment: input.comment, authorId: p.id }).returning();
    await tx.insert(inventoryItems).values(input.items.map((i) => ({ inventoryId: inv.id, productId: i.productId, expected: sm.get(i.productId) ?? 0, actual: i.actual })));
    await audit(tx, p, "create", "inventory", inv.id, `Инвентаризация №${number}: ${input.items.length} поз.${input.post ? ", проведена" : ""}`);
    return inv;
  });
}

export async function postInventory(db: DB, p: Principal, id: number) {
  assertCan(p, "stock", "full");
  const [inv] = await db.select().from(inventories).where(and(eq(inventories.id, id), isNull(inventories.deletedAt)));
  if (!inv) throw new NotFoundError();
  if (inv.posted) throw new ValidationError("Уже проведена");
  await db.update(inventories).set({ posted: true }).where(eq(inventories.id, id));
  await audit(db, p, "post", "inventory", id, `Проведена инвентаризация №${inv.number}`);
}

export async function listInventories(db: DB, p: Principal) {
  assertCan(p, "stock");
  return db.select({
    id: inventories.id, number: inventories.number, date: inventories.date, posted: inventories.posted, comment: inventories.comment,
    items: sql<number>`(select count(*)::int from inventory_items ii where ii.inventory_id = ${inventories.id})`,
    delta: sql<number>`(select coalesce(sum(ii.actual - ii.expected),0)::float8 from inventory_items ii where ii.inventory_id = ${inventories.id})`,
  }).from(inventories).where(isNull(inventories.deletedAt)).orderBy(desc(inventories.id)).limit(100);
}

export async function getInventory(db: DB, p: Principal, id: number) {
  assertCan(p, "stock");
  const [inv] = await db.select().from(inventories).where(eq(inventories.id, id));
  if (!inv) throw new NotFoundError();
  const items = await db.select({ id: inventoryItems.id, productId: inventoryItems.productId, expected: inventoryItems.expected, actual: inventoryItems.actual, name: products.name, unit: products.unit })
    .from(inventoryItems).innerJoin(products, eq(products.id, inventoryItems.productId)).where(eq(inventoryItems.inventoryId, id));
  return { ...inv, items };
}
