import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, priceHistory, priceTypes, productPrices, products, receiptItems, receipts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, assertFlag, flag, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { money, roundTenge, today } from "@/lib/format";
import { defaultWarehouse } from "@/modules/shipments/service";
import { emitWebhook } from "@/modules/webhooks/service";

export const receiptInput = z.object({
  supplierId: z.number().int({ error: "Выберите поставщика" }),
  warehouseId: z.number().int().optional(),
  date: z.string().default(() => today()),
  posted: z.boolean().default(false),
  supplierDocNumber: z.string().max(100).nullable().optional(),
  comment: z.string().max(2000).default(""),
  sourceFile: z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() }).nullable().optional(),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().positive(), price: z.number().int().min(0), excluded: z.boolean().default(false) })).min(1, "Добавьте позиции"),
});
export type ReceiptInput = z.infer<typeof receiptInput>;

const totalOf = (items: ReceiptInput["items"]) => items.filter((i) => !i.excluded).reduce((s, i) => s + Math.round(i.qty * i.price), 0);

export async function createReceipt(db: DB, p: Principal, input: ReceiptInput) {
  assertCan(p, "receipts", "full");
  assertFlag(p, "seePurchase");
  const [sup] = await db.select().from(counterparties).where(eq(counterparties.id, input.supplierId));
  if (!sup) throw new ValidationError("Поставщик не найден");
  const warehouseId = input.warehouseId ?? (await defaultWarehouse(db));
  const id = await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const number = await nextNumber(tx, "receipt");
    const [r] = await tx.insert(receipts).values({
      number, supplierId: sup.id, warehouseId, date: input.date, posted: input.posted, total: totalOf(input.items),
      supplierDocNumber: input.supplierDocNumber ?? null, comment: input.comment, sourceFile: input.sourceFile ?? null, authorId: p.id,
    }).returning();
    await tx.insert(receiptItems).values(input.items.map((i) => ({ ...i, receiptId: r.id })));
    await audit(tx, p, "create", "receipt", r.id, `Приёмка №${number} от «${sup.name}» на ${money(r.total)}${input.posted ? " (проведена)" : " (черновик)"}`);
    return r.id;
  });
  return getReceipt(db, p, id);
}

export async function updateReceipt(db: DB, p: Principal, id: number, input: ReceiptInput) {
  assertCan(p, "receipts", "full");
  assertFlag(p, "seePurchase");
  const [r0] = await db.select().from(receipts).where(and(eq(receipts.id, id), isNull(receipts.deletedAt)));
  if (!r0) throw new NotFoundError();
  if (r0.posted && !flag(p, "deleteDocs")) throw new ValidationError("Проведённую приёмку может менять только пользователь с правом «Удалять документы». Отмените проведение.");
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    await tx.delete(receiptItems).where(eq(receiptItems.receiptId, id));
    await tx.insert(receiptItems).values(input.items.map((i) => ({ ...i, receiptId: id })));
    await tx.update(receipts).set({
      supplierId: input.supplierId, date: input.date, posted: input.posted, total: totalOf(input.items), supplierDocNumber: input.supplierDocNumber ?? null,
      comment: input.comment, sourceFile: input.sourceFile ?? r0.sourceFile,
    }).where(eq(receipts.id, id));
    await audit(tx, p, "update", "receipt", id, `Изменена приёмка №${r0.number}`);
  });
  return getReceipt(db, p, id);
}

export async function setPosted(db: DB, p: Principal, id: number, posted: boolean) {
  assertCan(p, "receipts", "full");
  const [r] = await db.select().from(receipts).where(and(eq(receipts.id, id), isNull(receipts.deletedAt)));
  if (!r) throw new NotFoundError();
  if (!posted && !flag(p, "deleteDocs")) throw new ValidationError("Отмена проведения требует права «Удалять документы»");
  await db.update(receipts).set({ posted }).where(eq(receipts.id, id));
  await audit(db, p, "post", "receipt", id, `Приёмка №${r.number}: ${posted ? "проведена" : "проведение отменено"}`);
  if (posted) emitWebhook(db, "receipt.posted", { id, number: r.number, supplierId: r.supplierId, total: r.total });
}

export async function deleteReceipt(db: DB, p: Principal, id: number) {
  assertCan(p, "receipts", "full");
  const [r] = await db.select().from(receipts).where(and(eq(receipts.id, id), isNull(receipts.deletedAt)));
  if (!r) throw new NotFoundError();
  if (r.posted && !flag(p, "deleteDocs")) throw new ValidationError("Удаление проведённой приёмки требует права «Удалять документы»");
  await db.update(receipts).set({ deletedAt: new Date() }).where(eq(receipts.id, id));
  await audit(db, p, "delete", "receipt", id, `Удалена приёмка №${r.number}`);
}

/** Сравнение с прошлой закупкой (по любому поставщику, до даты этой приёмки) */
export async function priceComparison(db: DB, receiptId: number | null, items: { productId: number; price: number }[], date: string) {
  if (!items.length) return new Map<number, { prevPrice: number; prevDate: string; prevSupplier: string; delta: number; deltaPct: number }>();
  const ids = items.map((i) => i.productId);
  const prev = await q<{ product_id: number; price: number; date: string; supplier: string }>(db, sql`
    select distinct on (ri.product_id) ri.product_id, ri.price::float8, r.date::text, c.name as supplier
    from receipt_items ri join receipts r on r.id = ri.receipt_id join counterparties c on c.id = r.supplier_id
    where r.deleted_at is null and not ri.excluded and ri.price > 0 and r.id <> ${receiptId ?? -1} and r.date <= ${date}
      and ri.product_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})
    order by ri.product_id, r.date desc, r.id desc`);
  const res = new Map<number, { prevPrice: number; prevDate: string; prevSupplier: string; delta: number; deltaPct: number }>();
  for (const pr of prev) {
    const cur = items.find((i) => i.productId === pr.product_id);
    if (!cur) continue;
    const delta = cur.price - Number(pr.price);
    res.set(pr.product_id, { prevPrice: Number(pr.price), prevDate: pr.date, prevSupplier: pr.supplier, delta, deltaPct: Number(pr.price) ? (delta / Number(pr.price)) * 100 : 0 });
  }
  return res;
}

export async function getReceipt(db: DB, p: Principal, id: number) {
  assertCan(p, "receipts");
  const [r] = await db.select({ r: receipts, sup: counterparties }).from(receipts).innerJoin(counterparties, eq(counterparties.id, receipts.supplierId))
    .where(and(eq(receipts.id, id), isNull(receipts.deletedAt)));
  if (!r) throw new NotFoundError("Приёмка не найдена");
  const seeP = flag(p, "seePurchase");
  const items = await db.select({ id: receiptItems.id, productId: receiptItems.productId, qty: receiptItems.qty, price: receiptItems.price, excluded: receiptItems.excluded,
    name: products.name, unit: products.unit, sku: products.sku }).from(receiptItems).innerJoin(products, eq(products.id, receiptItems.productId)).where(eq(receiptItems.receiptId, id));
  const cmp = seeP ? await priceComparison(db, id, items, r.r.date) : new Map();
  const pays = await q<{ id: number; number: number; amount: number; date: string }>(db, sql`select id, number, amount::float8, date::text from payments where receipt_id = ${id} and deleted_at is null`);
  return {
    ...r.r, total: seeP ? r.r.total : null, supplier: r.sup, future: r.r.date > today(),
    payments: seeP ? pays.map((x) => ({ ...x, amount: Number(x.amount) })) : [],
    items: items.map((i) => ({ ...i, price: seeP ? i.price : null, compare: cmp.get(i.productId) ?? null })),
  };
}

export async function listReceipts(db: DB, p: Principal, params: { q?: string; supplierId?: number; posted?: boolean; page?: number; pageSize?: number } = {}) {
  assertCan(p, "receipts");
  const page = Math.max(1, params.page ?? 1), size = Math.min(200, params.pageSize ?? 30);
  const conds: (SQL | undefined)[] = [isNull(receipts.deletedAt)];
  if (params.supplierId) conds.push(eq(receipts.supplierId, params.supplierId));
  if (params.posted !== undefined) conds.push(eq(receipts.posted, params.posted));
  if (params.q) conds.push(sql`(lower(${counterparties.name}) like ${"%" + params.q.toLowerCase() + "%"} or ${receipts.number} = ${Number(params.q.replace(/\D/g, "")) || -1} or ${receipts.supplierDocNumber} = ${params.q})`);
  const where = and(...conds);
  const seeP = flag(p, "seePurchase");
  const rows = await db.select({ id: receipts.id, number: receipts.number, date: receipts.date, posted: receipts.posted, total: receipts.total, supplierName: counterparties.name,
    supplierId: receipts.supplierId, supplierDocNumber: receipts.supplierDocNumber, itemsCount: sql<number>`(select count(*)::int from receipt_items ri where ri.receipt_id = ${receipts.id})` })
    .from(receipts).innerJoin(counterparties, eq(counterparties.id, receipts.supplierId)).where(where).orderBy(desc(receipts.date), desc(receipts.id)).limit(size).offset((page - 1) * size);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(receipts).innerJoin(counterparties, eq(counterparties.id, receipts.supplierId)).where(where);
  return { rows: rows.map((r) => ({ ...r, total: seeP ? r.total : null, future: r.date > today() })), total: c, page, pageSize: size };
}

/**
 * Обновление цен по приёмке: закупочная = цена приёмки; розничные — по наценке от закупки (если задана)
 * или сохранением прежней наценки.
 */
export const applyPricesInput = z.object({
  receiptId: z.number().int(),
  updatePurchase: z.boolean().default(true),
  /** priceTypeId → режим */
  retail: z.record(z.string(), z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("keep") }),
    z.object({ mode: z.literal("markup"), percent: z.number() }),
    z.object({ mode: z.literal("keepMargin") }),
  ])).default({}),
  productIds: z.array(z.number().int()).optional(),
});

export async function applyReceiptPrices(db: DB, p: Principal, input: z.infer<typeof applyPricesInput>) {
  assertCan(p, "products", "full");
  assertFlag(p, "seePurchase");
  const r = await getReceipt(db, p, input.receiptId);
  const [purchase] = await db.select().from(priceTypes).where(eq(priceTypes.isPurchase, true)).limit(1);
  if (!purchase) throw new ValidationError("Не настроен закупочный тип цены");
  let changed = 0;
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    for (const it of r.items) {
      if (it.excluded || it.price == null || it.price <= 0) continue;
      if (input.productIds && !input.productIds.includes(it.productId)) continue;
      const cur = await tx.select().from(productPrices).where(eq(productPrices.productId, it.productId));
      const oldPurchase = cur.find((c) => c.priceTypeId === purchase.id)?.value ?? 0;
      const set = async (tid: number, nv: number) => {
        const old = cur.find((c) => c.priceTypeId === tid)?.value ?? 0;
        if (old === nv) return;
        await tx.insert(productPrices).values({ productId: it.productId, priceTypeId: tid, value: nv })
          .onConflictDoUpdate({ target: [productPrices.productId, productPrices.priceTypeId], set: { value: nv } });
        await tx.insert(priceHistory).values({ productId: it.productId, priceTypeId: tid, oldValue: old, newValue: nv, userId: p.id, source: "receipt" });
        changed++;
      };
      if (input.updatePurchase) await set(purchase.id, it.price);
      for (const [k, rule] of Object.entries(input.retail)) {
        const tid = Number(k);
        if (rule.mode === "keep") continue;
        if (rule.mode === "markup") await set(tid, roundTenge(it.price * (1 + rule.percent / 100)));
        if (rule.mode === "keepMargin") {
          const old = cur.find((c) => c.priceTypeId === tid)?.value ?? 0;
          if (oldPurchase > 0 && old > 0) await set(tid, roundTenge((old / oldPurchase) * it.price));
        }
      }
    }
    await audit(tx, p, "update", "receipt", r.id, `Обновлены цены по приёмке №${r.number}: ${changed} изм.`);
  });
  return { changed };
}

export { products };
