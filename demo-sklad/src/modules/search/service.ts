import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, folders, priceHistory, products, users } from "@/db/schema";
import { can, flag, type Principal } from "@/lib/rbac";
import { pricesFor, visiblePriceTypes } from "@/modules/products/service";
import { balancesSql } from "@/modules/counterparties/service";
import { stockSql } from "@/modules/stock/queries";
import { getSetting } from "@/modules/settings/store";

/**
 * Лёгкий индекс для мгновенного поиска на клиенте (Web Worker + IndexedDB).
 * Права применяются здесь: без «видеть закупочные цены» тип закупки и его цены в ответ не попадают вообще.
 * Дельты: товары/контрагенты, изменённые после `since`; остатки, продажи и долги — компактной таблицей целиком.
 */
export type IdxProduct = { id: number; n: string; sku: string | null; bc: string | null; u: string; f: number | null; ph: number | null; mn: number; pr: Record<number, number> };
export type IdxCp = { id: number; n: string; k: string; seg: string; tags: string[]; ph: string | null; wa: string | null; bin: string | null; svc: boolean; m: number | null };
export type IndexPayload = {
  v: 1; now: number; permKey: string; full: boolean;
  canProducts: boolean; canCreateProduct: boolean; canCounterparties: boolean;
  priceTypes: { id: number; name: string; isPurchase: boolean }[];
  folders: { id: number; name: string; parentId: number | null }[];
  users: { id: number; name: string; sales: boolean }[];
  synonyms: string[][];
  products: { rows: IdxProduct[]; deleted: number[] };
  cps: { rows: IdxCp[]; deleted: number[] };
  /** [id, остаток, продаж за 180 дней] */
  pStats: [number, number, number][];
  /** [id, долг клиента, наш долг] */
  cStats: [number, number, number][];
};

export const INDEX_VERSION = 1;

export function parseSynonyms(text: string) {
  return text.split(/\r?\n/).map((l) => l.split(/[=,;]/).map((t) => t.trim()).filter(Boolean)).filter((g) => g.length > 1).slice(0, 500);
}

export async function permKeyOf(db: DB, p: Principal) {
  const types = can(p, "products") ? (await visiblePriceTypes(db, p)).map((t) => t.id) : [];
  return createHash("sha256").update(JSON.stringify([INDEX_VERSION, p.id, flag(p, "seePurchase"), can(p, "products"), can(p, "counterparties"), types])).digest("hex").slice(0, 16);
}

export async function searchIndex(db: DB, p: Principal, opts: { since?: number; permKey?: string } = {}): Promise<IndexPayload> {
  const [{ now }] = await q<{ now: number }>(db, sql`select (extract(epoch from now()) * 1000)::float8 as now`);
  const permKey = await permKeyOf(db, p);
  const full = !opts.since || opts.permKey !== permKey;
  // запас 5 с на рассинхрон часов и долгие транзакции
  const since = full ? null : new Date(opts.since! - 5000);
  const canP = can(p, "products"), canC = can(p, "counterparties");
  const settings = await getSetting(db, "search");

  const out: IndexPayload = {
    v: 1, now: Number(now), permKey, full,
    canProducts: canP, canCreateProduct: can(p, "products", "full"), canCounterparties: canC,
    priceTypes: [], folders: [], users: [], synonyms: parseSynonyms(settings.synonyms),
    products: { rows: [], deleted: [] }, cps: { rows: [], deleted: [] }, pStats: [], cStats: [],
  };

  out.users = (await db.select({ id: users.id, name: users.name, sales: users.isSalesManager }).from(users)
    .where(and(isNull(users.deletedAt), eq(users.active, true))).orderBy(asc(users.name)));

  if (canP) {
    out.priceTypes = (await visiblePriceTypes(db, p)).map((t) => ({ id: t.id, name: t.name, isPurchase: t.isPurchase }));
    out.folders = await db.select({ id: folders.id, name: folders.name, parentId: folders.parentId }).from(folders).orderBy(asc(folders.sort), asc(folders.name));
    const changed = since
      ? or(gt(products.updatedAt, since), gt(products.createdAt, since), gt(products.deletedAt, since),
          inArray(products.id, db.select({ id: priceHistory.productId }).from(priceHistory).where(gt(priceHistory.createdAt, since))))
      : undefined;
    const rows = await db.select({ id: products.id, n: products.name, sku: products.sku, bc: products.barcode, u: products.unit, f: products.folderId, photos: products.photos, mn: products.minStock, active: products.active, deletedAt: products.deletedAt })
      .from(products).where(changed);
    const live = rows.filter((r) => r.active && !r.deletedAt);
    out.products.deleted = since ? rows.filter((r) => !r.active || r.deletedAt).map((r) => r.id) : [];
    const prices = await pricesFor(db, p, live.map((r) => r.id)); // только видимые типы цен
    out.products.rows = live.map((r) => ({ id: r.id, n: r.n, sku: r.sku, bc: r.bc, u: r.u, f: r.f, ph: r.photos[0]?.id ?? null, mn: Number(r.mn), pr: prices.get(r.id) ?? {} }));
    const st = stockSql();
    out.pStats = (await q<{ id: number; qty: number; pop: number }>(db, sql`
      select p.id, coalesce(st.qty, 0)::float8 as qty, coalesce(pop.n, 0)::int as pop
      from products p
      left join ${st} st on st.product_id = p.id
      left join (select oi.product_id, count(distinct oi.order_id) as n from order_items oi join orders o on o.id = oi.order_id
                 where o.deleted_at is null and o.created_at > now() - interval '180 days' group by oi.product_id) pop on pop.product_id = p.id
      where p.deleted_at is null and p.active`)).map((r) => [r.id, Number(r.qty), Number(r.pop)]);
  }

  if (canC) {
    const changed = since ? or(gt(counterparties.updatedAt, since), gt(counterparties.createdAt, since), gt(counterparties.deletedAt, since)) : undefined;
    const rows = await db.select().from(counterparties).where(changed);
    out.cps.deleted = since ? rows.filter((r) => r.deletedAt).map((r) => r.id) : [];
    out.cps.rows = rows.filter((r) => !r.deletedAt).map((r) => ({ id: r.id, n: r.name, k: r.kind, seg: r.segment, tags: r.tags, ph: r.phone, wa: r.whatsapp, bin: r.bin, svc: r.isService, m: r.managerId }));
    out.cStats = (await q<{ id: number; cd: number; od: number }>(db, sql`
      select b.cp_id as id, b.client_debt::float8 as cd, b.our_debt::float8 as od from ${balancesSql()} b
      join counterparties c on c.id = b.cp_id where c.deleted_at is null and (b.client_debt <> 0 or b.our_debt <> 0)`)).map((r) => [r.id, Number(r.cd), Number(r.od)]);
  }
  return out;
}

/** Что брал клиент раньше: [товар, сколько раз] — для ранжирования в заявке */
export async function clientHistory(db: DB, p: Principal, cpId: number): Promise<[number, number][]> {
  if (!can(p, "orders") && !can(p, "shipments")) return [];
  const rows = await q<{ id: number; n: number }>(db, sql`
    select oi.product_id as id, count(distinct oi.order_id)::int as n from order_items oi join orders o on o.id = oi.order_id
    where o.counterparty_id = ${cpId} and o.deleted_at is null and o.created_at > now() - interval '2 years'
    group by oi.product_id order by n desc limit 500`);
  return rows.map((r) => [r.id, Number(r.n)]);
}
