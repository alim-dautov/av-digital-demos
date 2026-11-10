import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { folders, priceBatches, priceHistory, priceTypes, productPrices, products, counterparties, receiptItems, receipts } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, flag, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { norm } from "@/lib/format";
import { stockSql, incomingSql } from "@/modules/stock/queries";

export const productInput = z.object({
  name: z.string().trim().min(1, "Укажите название").max(300),
  sku: z.string().trim().max(100).optional().nullable(),
  barcode: z.string().trim().max(100).optional().nullable(),
  unit: z.string().trim().min(1).max(20).default("шт"),
  description: z.string().max(5000).default(""),
  folderId: z.number().int().nullable().optional(),
  minStock: z.number().min(0).default(0),
  active: z.boolean().default(true),
  photos: z.array(z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() })).default([]),
  /** priceTypeId → тиын */
  prices: z.record(z.string(), z.number().int().min(0)).default({}),
});
export type ProductInput = z.infer<typeof productInput>;

export async function visiblePriceTypes(db: DB, p: Principal) {
  const all = await db.select().from(priceTypes).where(eq(priceTypes.active, true)).orderBy(asc(priceTypes.sort));
  return flag(p, "seePurchase") ? all : all.filter((t) => !t.isPurchase);
}

export async function purchaseTypeId(db: DB) {
  const [t] = await db.select({ id: priceTypes.id }).from(priceTypes).where(eq(priceTypes.isPurchase, true)).orderBy(asc(priceTypes.sort)).limit(1);
  return t?.id ?? null;
}

const searchText = (i: { name: string; sku?: string | null; barcode?: string | null }) => norm([i.name, i.sku, i.barcode].filter(Boolean).join(" "));

export function searchWhere(qs: string): SQL | undefined {
  const tokens = norm(qs).split(" ").filter(Boolean).slice(0, 6);
  if (!tokens.length) return undefined;
  return and(...tokens.map((t) => sql`${products.searchText} like ${"%" + t + "%"}`));
}

/** Все папки-потомки (включая саму) */
export async function folderDescendants(db: DB, folderId: number): Promise<number[]> {
  const all = await db.select({ id: folders.id, parentId: folders.parentId }).from(folders);
  const res = [folderId];
  for (let i = 0; i < res.length; i++) for (const f of all) if (f.parentId === res[i]) res.push(f.id);
  return res;
}

export type ProductListParams = { q?: string; folderId?: number | null; page?: number; pageSize?: number; active?: boolean; lowStock?: boolean; ids?: number[] };

export async function listProducts(db: DB, p: Principal, params: ProductListParams = {}) {
  assertCan(p, "products");
  const page = Math.max(1, params.page ?? 1), size = Math.min(500, params.pageSize ?? 50);
  const conds: (SQL | undefined)[] = [isNull(products.deletedAt)];
  if (params.q) conds.push(searchWhere(params.q));
  if (params.folderId) conds.push(inArray(products.folderId, await folderDescendants(db, params.folderId)));
  if (params.active !== undefined) conds.push(eq(products.active, params.active));
  if (params.ids) conds.push(params.ids.length ? inArray(products.id, params.ids) : sql`false`);
  const st = stockSql();
  if (params.lowStock) conds.push(sql`coalesce(st.qty, 0) < ${products.minStock}`);
  const where = and(...conds);
  const rows = await db
    .select({
      id: products.id, name: products.name, sku: products.sku, barcode: products.barcode, unit: products.unit, folderId: products.folderId,
      active: products.active, minStock: products.minStock, photos: products.photos, stock: sql<number>`coalesce(st.qty, 0)`,
    })
    .from(products)
    .leftJoin(sql`${st} st`, sql`st.product_id = ${products.id}`)
    .where(where)
    .orderBy(asc(products.name))
    .limit(size)
    .offset((page - 1) * size);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(products).leftJoin(sql`${st} st`, sql`st.product_id = ${products.id}`).where(where);
  const prices = await pricesFor(db, p, rows.map((r) => r.id));
  return { rows: rows.map((r) => ({ ...r, stock: Number(r.stock), prices: prices.get(r.id) ?? {} })), total: c, page, pageSize: size };
}

/** Цены товаров: productId → { priceTypeId: value }, закупка скрыта без права */
export async function pricesFor(db: DB, p: Principal, ids: number[]) {
  const map = new Map<number, Record<number, number>>();
  if (!ids.length) return map;
  const types = await visiblePriceTypes(db, p);
  const allowed = new Set(types.map((t) => t.id));
  const rows = await db.select().from(productPrices).where(inArray(productPrices.productId, ids));
  for (const r of rows) {
    if (!allowed.has(r.priceTypeId)) continue;
    const m = map.get(r.productId) ?? {};
    m[r.priceTypeId] = r.value;
    map.set(r.productId, m);
  }
  return map;
}

export async function getProduct(db: DB, p: Principal, id: number) {
  assertCan(p, "products");
  const [pr] = await db.select().from(products).where(and(eq(products.id, id), isNull(products.deletedAt)));
  if (!pr) throw new NotFoundError("Товар не найден");
  const prices = (await pricesFor(db, p, [id])).get(id) ?? {};
  const types = await visiblePriceTypes(db, p);
  const allowed = types.map((t) => t.id);
  const history = await db.select().from(priceHistory)
    .where(and(eq(priceHistory.productId, id), allowed.length ? inArray(priceHistory.priceTypeId, allowed) : sql`false`))
    .orderBy(desc(priceHistory.createdAt)).limit(100);
  const [stock] = await q<{ qty: number }>(db, sql`select qty from ${stockSql()} s where s.product_id = ${id}`);
  const [incoming] = await q<{ qty: number; eta: string }>(db, sql`select qty, eta from ${incomingSql()} s where s.product_id = ${id}`);
  const lastBySupplier = flag(p, "seePurchase") ? await lastPurchaseBySupplier(db, [id]) : [];
  return { ...pr, prices, priceTypes: types, history, stock: Number(stock?.qty ?? 0), incoming: incoming ? { qty: Number(incoming.qty), eta: incoming.eta } : null, lastBySupplier };
}

/** «По чём брали последний раз»: последняя цена закупки у каждого поставщика */
export async function lastPurchaseBySupplier(db: DB, productIds: number[]) {
  if (!productIds.length) return [];
  return q<{ productId: number; supplierId: number; supplierName: string; price: number; date: string; receiptId: number; receiptNumber: number }>(db, sql`
    select distinct on (ri.product_id, r.supplier_id)
      ri.product_id as "productId", r.supplier_id as "supplierId", c.name as "supplierName", ri.price::float8 as price, r.date::text as date,
      r.id as "receiptId", r.number as "receiptNumber"
    from ${receiptItems} ri join ${receipts} r on r.id = ri.receipt_id join ${counterparties} c on c.id = r.supplier_id
    where r.deleted_at is null and not ri.excluded and ri.price > 0 and ri.product_id in (${sql.join(productIds.map((i) => sql`${i}`), sql`, `)})
    order by ri.product_id, r.supplier_id, r.date desc, r.id desc`);
}

async function writePrices(db: DB, p: Principal, productId: number, prices: Record<string, number>, source: string, batchId?: number) {
  const types = await visiblePriceTypes(db, p);
  const allowed = new Set(types.map((t) => t.id));
  const existing = await db.select().from(productPrices).where(eq(productPrices.productId, productId));
  for (const [k, v] of Object.entries(prices)) {
    const tid = Number(k);
    if (!allowed.has(tid)) continue; // закупку без права не меняем
    const old = existing.find((e) => e.priceTypeId === tid)?.value ?? 0;
    if (old === v) continue;
    await db.insert(productPrices).values({ productId, priceTypeId: tid, value: v })
      .onConflictDoUpdate({ target: [productPrices.productId, productPrices.priceTypeId], set: { value: v } });
    await db.insert(priceHistory).values({ productId, priceTypeId: tid, oldValue: old, newValue: v, userId: p.id, source, batchId });
  }
}

export async function createProduct(db: DB, p: Principal, input: ProductInput) {
  assertCan(p, "products", "full");
  return db.transaction(async (tx) => {
    const [pr] = await tx.insert(products).values({
      name: input.name, sku: input.sku || null, barcode: input.barcode || null, unit: input.unit, description: input.description,
      folderId: input.folderId ?? null, minStock: input.minStock, active: input.active, photos: input.photos, searchText: searchText(input),
    }).returning();
    await writePrices(tx as unknown as DB, p, pr.id, input.prices, "manual");
    await audit(tx as unknown as DB, p, "create", "product", pr.id, `Создан товар «${pr.name}»`);
    return pr;
  });
}

export async function updateProduct(db: DB, p: Principal, id: number, input: ProductInput) {
  assertCan(p, "products", "full");
  return db.transaction(async (tx) => {
    const [pr] = await tx.update(products).set({
      name: input.name, sku: input.sku || null, barcode: input.barcode || null, unit: input.unit, description: input.description,
      folderId: input.folderId ?? null, minStock: input.minStock, active: input.active, photos: input.photos, searchText: searchText(input), updatedAt: new Date(),
    }).where(and(eq(products.id, id), isNull(products.deletedAt))).returning();
    if (!pr) throw new NotFoundError();
    await writePrices(tx as unknown as DB, p, id, input.prices, "manual");
    await audit(tx as unknown as DB, p, "update", "product", id, `Изменён товар «${pr.name}»`);
    return pr;
  });
}

export async function deleteProducts(db: DB, p: Principal, ids: number[]) {
  assertCan(p, "products", "full");
  await db.update(products).set({ deletedAt: new Date() }).where(inArray(products.id, ids));
  await audit(db, p, "delete", "product", ids.join(","), `Удалено товаров: ${ids.length}`);
}

export async function moveProducts(db: DB, p: Principal, ids: number[], folderId: number | null) {
  assertCan(p, "products", "full");
  await db.update(products).set({ folderId, updatedAt: new Date() }).where(inArray(products.id, ids));
  await audit(db, p, "update", "product", ids.join(","), `Перемещено товаров: ${ids.length}`, { folderId });
}

/* ───── Папки ───── */

export async function listFolders(db: DB) {
  const all = await db.select().from(folders).orderBy(asc(folders.sort), asc(folders.name));
  const counts = await q<{ folder_id: number; c: number }>(db, sql`select folder_id, count(*)::int c from products where deleted_at is null group by folder_id`);
  const cm = new Map(counts.map((c) => [c.folder_id, c.c]));
  return all.map((f) => ({ ...f, count: cm.get(f.id) ?? 0 }));
}
export async function saveFolder(db: DB, p: Principal, input: { id?: number; name: string; parentId: number | null }) {
  assertCan(p, "products", "full");
  if (input.id) {
    if (input.parentId && (await folderDescendants(db, input.id)).includes(input.parentId)) throw new ValidationError("Нельзя вложить папку саму в себя");
    const [f] = await db.update(folders).set({ name: input.name, parentId: input.parentId }).where(eq(folders.id, input.id)).returning();
    return f;
  }
  const [f] = await db.insert(folders).values({ name: input.name, parentId: input.parentId }).returning();
  await audit(db, p, "create", "folder", f.id, `Создана папка «${f.name}»`);
  return f;
}
export async function deleteFolder(db: DB, p: Principal, id: number) {
  assertCan(p, "products", "full");
  const [f] = await db.select().from(folders).where(eq(folders.id, id));
  if (!f) throw new NotFoundError();
  await db.update(products).set({ folderId: f.parentId }).where(eq(products.folderId, id));
  await db.update(folders).set({ parentId: f.parentId }).where(eq(folders.parentId, id));
  await db.delete(folders).where(eq(folders.id, id));
  await audit(db, p, "delete", "folder", id, `Удалена папка «${f.name}»`);
}

/* ───── Массовая смена цен ───── */

export const COLOR_WORDS = [
  "желто-зеленый", "желто-зелёный", "жёлто-зелёный", "ж/з", "белый", "белая", "черный", "чёрный", "черная", "красный", "красная", "синий", "синяя",
  "голубой", "голубая", "желтый", "жёлтый", "зеленый", "зелёный", "серый", "серая", "коричневый", "оранжевый", "фиолетовый", "розовый", "бежевый",
];
/** Ключ группы «один товар разных цветов»: название без слов-цветов */
export function colorGroupKey(name: string) {
  let s = norm(name);
  for (const w of COLOR_WORDS) s = s.replace(new RegExp(`(^|\\s|\\()${norm(w).replace(/[/-]/g, "\\$&")}(?=$|\\s|\\))`, "g"), " ");
  return s.replace(/\(\s*\)/g, "").replace(/\s+/g, " ").trim();
}

export const bulkPriceInput = z.object({
  selection: z.object({ productIds: z.array(z.number().int()).optional(), folderId: z.number().int().optional(), q: z.string().optional() }),
  priceTypeIds: z.array(z.number().int()).min(1, "Выберите тип цены"),
  op: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("percent"), value: z.number().min(-99).max(1000) }),
    z.object({ kind: z.literal("amount"), value: z.number().int() }), // тиын, ±
    z.object({ kind: z.literal("set"), value: z.number().int().min(0) }),
    z.object({ kind: z.literal("align"), mode: z.enum(["max", "min", "avg"]) }),
    z.object({ kind: z.literal("fromType"), sourceTypeId: z.number().int(), percent: z.number() }),
  ]),
  rounding: z.object({ step: z.number().int().min(1).default(1), mode: z.enum(["nearest", "up", "down"]).default("nearest") }).default({ step: 1, mode: "nearest" }),
});
export type BulkPriceInput = z.infer<typeof bulkPriceInput>;

export function roundPrice(tiyn: number, stepTenge: number, mode: "nearest" | "up" | "down") {
  const step = Math.max(1, stepTenge) * 100;
  const f = mode === "up" ? Math.ceil : mode === "down" ? Math.floor : Math.round;
  return Math.max(0, f(tiyn / step) * step);
}

/** Чистый расчёт изменений (для предпросмотра и применения) */
export function computeBulkChanges(
  items: { id: number; name: string; prices: Record<number, number> }[],
  input: Pick<BulkPriceInput, "priceTypeIds" | "op" | "rounding">,
) {
  const changes: { productId: number; name: string; priceTypeId: number; old: number; new: number }[] = [];
  const { op, rounding } = input;
  const groups = new Map<string, typeof items>();
  if (op.kind === "align") for (const it of items) { const k = colorGroupKey(it.name); groups.set(k, [...(groups.get(k) ?? []), it]); }
  for (const tid of input.priceTypeIds) {
    for (const it of items) {
      const old = it.prices[tid] ?? 0;
      let nv = old;
      if (op.kind === "percent") nv = old * (1 + op.value / 100);
      else if (op.kind === "amount") nv = old + op.value;
      else if (op.kind === "set") nv = op.value;
      else if (op.kind === "fromType") nv = (it.prices[op.sourceTypeId] ?? 0) * (1 + op.percent / 100);
      else if (op.kind === "align") {
        const g = groups.get(colorGroupKey(it.name))!;
        const vals = g.map((x) => x.prices[tid] ?? 0).filter((v) => v > 0);
        if (!vals.length || g.length < 2) continue;
        nv = op.mode === "max" ? Math.max(...vals) : op.mode === "min" ? Math.min(...vals) : vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      nv = roundPrice(nv, rounding.step, rounding.mode);
      if (nv !== old) changes.push({ productId: it.id, name: it.name, priceTypeId: tid, old, new: nv });
    }
  }
  return changes;
}

async function bulkSelection(db: DB, p: Principal, sel: BulkPriceInput["selection"]) {
  const res = await listProducts(db, p, { q: sel.q, folderId: sel.folderId ?? null, ids: sel.productIds, pageSize: 500, page: 1 });
  let rows = res.rows;
  for (let page = 2; rows.length < res.total; page++) rows = rows.concat((await listProducts(db, p, { q: sel.q, folderId: sel.folderId ?? null, ids: sel.productIds, pageSize: 500, page })).rows);
  return rows;
}

export async function previewBulkPrice(db: DB, p: Principal, input: BulkPriceInput) {
  assertCan(p, "products", "full");
  const items = await bulkSelection(db, p, input.selection);
  return { count: items.length, changes: computeBulkChanges(items, input) };
}

export async function applyBulkPrice(db: DB, p: Principal, input: BulkPriceInput, description: string) {
  assertCan(p, "products", "full");
  const allowed = new Set((await visiblePriceTypes(db, p)).map((t) => t.id));
  if (input.priceTypeIds.some((t) => !allowed.has(t))) throw new ValidationError("Нет права менять закупочные цены");
  const items = await bulkSelection(db, p, input.selection);
  const changes = computeBulkChanges(items, input);
  if (!changes.length) throw new ValidationError("Нет изменений");
  return db.transaction(async (tx) => {
    const [batch] = await tx.insert(priceBatches).values({ userId: p.id, description, changes: changes.map(({ name: _n, ...c }) => c) }).returning();
    for (const c of changes) {
      await tx.insert(productPrices).values({ productId: c.productId, priceTypeId: c.priceTypeId, value: c.new })
        .onConflictDoUpdate({ target: [productPrices.productId, productPrices.priceTypeId], set: { value: c.new } });
      await tx.insert(priceHistory).values({ productId: c.productId, priceTypeId: c.priceTypeId, oldValue: c.old, newValue: c.new, userId: p.id, batchId: batch.id, source: "batch" });
    }
    await audit(tx as unknown as DB, p, "update", "price_batch", batch.id, `Массовая смена цен: ${description} (${changes.length} изм.)`);
    return { batchId: batch.id, count: changes.length };
  });
}

export async function lastBatch(db: DB) {
  const [b] = await db.select().from(priceBatches).where(isNull(priceBatches.rolledBackAt)).orderBy(desc(priceBatches.id)).limit(1);
  return b ?? null;
}

export async function rollbackBatch(db: DB, p: Principal, batchId: number) {
  assertCan(p, "products", "full");
  const last = await lastBatch(db);
  if (!last || last.id !== batchId) throw new ValidationError("Откатить можно только последнюю операцию");
  return db.transaction(async (tx) => {
    for (const c of last.changes) {
      await tx.update(productPrices).set({ value: c.old }).where(and(eq(productPrices.productId, c.productId), eq(productPrices.priceTypeId, c.priceTypeId)));
      await tx.insert(priceHistory).values({ productId: c.productId, priceTypeId: c.priceTypeId, oldValue: c.new, newValue: c.old, userId: p.id, batchId, source: "rollback" });
    }
    await tx.update(priceBatches).set({ rolledBackAt: new Date() }).where(eq(priceBatches.id, batchId));
    await audit(tx as unknown as DB, p, "update", "price_batch", batchId, `Откат массовой смены цен «${last.description}»`);
    return { count: last.changes.length };
  });
}

/* ───── Быстрый поиск (комбобокс, заявки) ───── */

export async function quickSearch(db: DB, p: Principal, qs: string, limit = 20) {
  assertCan(p, "products");
  const where = and(isNull(products.deletedAt), eq(products.active, true), searchWhere(qs));
  const st = stockSql();
  const rows = await db.select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit, stock: sql<number>`coalesce(st.qty,0)` })
    .from(products).leftJoin(sql`${st} st`, sql`st.product_id = ${products.id}`).where(where).orderBy(asc(products.name)).limit(limit);
  const prices = await pricesFor(db, p, rows.map((r) => r.id));
  const last = flag(p, "seePurchase") ? await lastPurchaseBySupplier(db, rows.map((r) => r.id)) : [];
  return rows.map((r) => ({ ...r, stock: Number(r.stock), prices: prices.get(r.id) ?? {}, lastPurchases: last.filter((l) => l.productId === r.id) }));
}

/** Каталог для нечёткого сопоставления (кэшируется на 60 с) */
let catalogCache: { at: number; rows: { id: number; name: string; sku: string | null; unit: string; key: string }[] } | null = null;
export async function catalog(db: DB) {
  if (catalogCache && Date.now() - catalogCache.at < 60000) return catalogCache.rows;
  const rows = await db.select({ id: products.id, name: products.name, sku: products.sku, unit: products.unit }).from(products)
    .where(and(isNull(products.deletedAt), eq(products.active, true)));
  catalogCache = { at: Date.now(), rows: rows.map((r) => ({ ...r, key: norm(`${r.name} ${r.sku ?? ""}`) })) };
  return catalogCache.rows;
}
export function invalidateCatalog() { catalogCache = null; }
