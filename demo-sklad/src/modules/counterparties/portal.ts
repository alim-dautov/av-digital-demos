import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, linkViewer, NotFoundError, type Principal } from "@/lib/rbac";
import { addDays, norm, today } from "@/lib/format";
import { balanceOf, overdueDays, reconciliation } from "./service";

/**
 * Личный кабинет контрагента по постоянной ссылке /p/client/<token>.
 * Токен случайный (не подпись), хранится у контрагента — ссылку можно отозвать или перевыпустить.
 */

const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;
const newToken = () => randomBytes(18).toString("base64url");
export const portalPath = (token: string) => `/p/client/${token}`;

/** Получить ссылку (создать, если её нет; regenerate — выпустить новую, старая перестаёт работать) */
export async function ensurePortalLink(db: DB, p: Principal, id: number, regenerate = false) {
  assertCan(p, "counterparties", regenerate ? "full" : "view");
  const [cp] = await db.select({ id: counterparties.id, name: counterparties.name, token: counterparties.portalToken })
    .from(counterparties).where(and(eq(counterparties.id, id), isNull(counterparties.deletedAt)));
  if (!cp) throw new NotFoundError("Контрагент не найден");
  if (cp.token && !regenerate) return cp.token;
  const token = newToken();
  await db.update(counterparties).set({ portalToken: token, portalCreatedAt: new Date(), portalViewedAt: null }).where(eq(counterparties.id, id));
  await audit(db, p, regenerate ? "portal.regenerate" : "portal.create", "counterparty", id, `${regenerate ? "Перевыпущена" : "Создана"} ссылка на кабинет: ${cp.name}`);
  return token;
}

export async function revokePortalLink(db: DB, p: Principal, id: number) {
  assertCan(p, "counterparties", "full");
  const [cp] = await db.update(counterparties).set({ portalToken: null, portalCreatedAt: null, portalViewedAt: null })
    .where(eq(counterparties.id, id)).returning({ name: counterparties.name });
  if (!cp) throw new NotFoundError("Контрагент не найден");
  await audit(db, p, "portal.revoke", "counterparty", id, `Отозвана ссылка на кабинет: ${cp.name}`);
}

/** Контрагент по токену кабинета (или null) */
export async function cpByPortalToken(db: DB, token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const [cp] = await db.select().from(counterparties).where(and(eq(counterparties.portalToken, token), isNull(counterparties.deletedAt)));
  return cp ?? null;
}

/** Субъект для данных кабинета: только просмотр, без флагов — себестоимость и маржа скрыты */
export const portalViewer = () => linkViewer({ counterparties: "view", shipments: "view", orders: "view", payments: "view" });

type Item = { name: string; unit: string; qty: number; price: number };

export async function portalData(db: DB, token: string, period: { from?: string; to?: string } = {}) {
  const cp = await cpByPortalToken(db, token);
  if (!cp) return null;
  // отметка «клиент открывал» — не чаще раза в 10 минут
  if (!cp.portalViewedAt || Date.now() - cp.portalViewedAt.getTime() > 600_000) {
    await db.update(counterparties).set({ portalViewedAt: new Date() }).where(eq(counterparties.id, cp.id));
  }
  const id = cp.id;
  const isClient = cp.kind !== "supplier", isSupplier = cp.kind !== "client";
  const bal = await balanceOf(db, id);
  const overdue = isClient ? await overdueDays(db, id, bal.clientDebt) : 0;

  const [manager] = cp.managerId ? await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, cp.managerId)) : [];

  const [tot] = await q<{ shipped: number; returned: number; paid: number; last_pay: string | null; last_ship: string | null }>(db, sql`select
    coalesce((select sum(total) from shipments where counterparty_id = ${id} and kind = 'shipment' and posted and deleted_at is null), 0)::float8 shipped,
    coalesce((select sum(total) from shipments where counterparty_id = ${id} and kind = 'return' and posted and deleted_at is null), 0)::float8 returned,
    coalesce((select sum(amount) from payments where counterparty_id = ${id} and direction = 'in' and deleted_at is null), 0)::float8 paid,
    (select max(date)::text from payments where counterparty_id = ${id} and direction = 'in' and deleted_at is null) last_pay,
    (select max(date)::text from shipments where counterparty_id = ${id} and kind = 'shipment' and posted and deleted_at is null) last_ship`);

  const orders = isClient ? await q<{ id: number; number: number; date: string; delivery_date: string | null; total: number; status: string; color: string; is_final: boolean; is_cancelled: boolean; paid: number; shipped: number }>(db, sql`
    select o.id, o.number, (o.created_at at time zone 'Asia/Almaty')::date::text date, o.delivery_date::text, o.total::float8 total,
      s.name status, s.color, s.is_final, s.is_cancelled,
      coalesce((select sum(p.amount) from payments p where p.order_id = o.id and p.direction = 'in' and p.deleted_at is null), 0)::float8 paid,
      coalesce((select sum(case when sh.kind = 'shipment' then sh.total else -sh.total end) from shipments sh where sh.order_id = o.id and sh.posted and sh.deleted_at is null), 0)::float8 shipped
    from orders o join order_statuses s on s.id = o.status_id
    where o.counterparty_id = ${id} and o.deleted_at is null order by o.created_at desc, o.id desc limit 30`) : [];

  const shipments = isClient ? await q<{ id: number; number: number; kind: string; date: string; total: number; order_number: number | null }>(db, sql`
    select s.id, s.number, s.kind, s.date::text, s.total::float8 total, o.number order_number
    from shipments s left join orders o on o.id = s.order_id
    where s.counterparty_id = ${id} and s.posted and s.deleted_at is null order by s.date desc, s.id desc limit 50`) : [];

  const receipts = isSupplier ? await q<{ id: number; number: number; date: string; total: number }>(db, sql`
    select id, number, date::text, total::float8 total from receipts where supplier_id = ${id} and posted and deleted_at is null order by date desc, id desc limit 50`) : [];

  const payments = await q<{ id: number; number: number; direction: string; date: string; amount: number; method: string; order_number: number | null; shipment_number: number | null }>(db, sql`
    select p.id, p.number, p.direction, p.date::text, p.amount::float8 amount, p.method, o.number order_number, s.number shipment_number
    from payments p left join orders o on o.id = p.order_id left join shipments s on s.id = p.shipment_id
    where p.counterparty_id = ${id} and p.deleted_at is null
      ${isClient && !isSupplier ? sql`and p.direction = 'in'` : !isClient ? sql`and p.direction = 'out'` : sql``}
    order by p.date desc, p.id desc limit 50`);

  // позиции заявок и накладных одним запросом на каждый тип (продаж. цены — без себестоимости)
  const orderItems = new Map<number, Item[]>();
  if (orders.length) {
    const rows = await q<{ order_id: number; name: string; unit: string; qty: number; price: number }>(db, sql`
      select oi.order_id, pr.name, pr.unit, oi.qty::float8 qty, oi.price::float8 price from order_items oi join products pr on pr.id = oi.product_id
      where oi.order_id in (${sql.join(orders.map((o) => sql`${o.id}`), sql`, `)}) order by oi.sort, oi.id`);
    for (const r of rows) push(orderItems, r.order_id, r);
  }
  const shipmentItems = new Map<number, Item[]>();
  if (shipments.length) {
    const rows = await q<{ shipment_id: number; name: string; unit: string; qty: number; price: number }>(db, sql`
      select si.shipment_id, pr.name, pr.unit, si.qty::float8 qty, si.price::float8 price from shipment_items si join products pr on pr.id = si.product_id
      where si.shipment_id in (${sql.join(shipments.map((s) => sql`${s.id}`), sql`, `)}) order by si.id`);
    for (const r of rows) push(shipmentItems, r.shipment_id, r);
  }

  const D = /^\d{4}-\d{2}-\d{2}$/;
  const to = period.to && D.test(period.to) ? period.to : today();
  const from = period.from && D.test(period.from) && period.from <= to ? period.from : addDays(to, -89);
  const recon = await reconciliation(db, portalViewer(), id, from, to, isClient ? "client" : "supplier");

  return {
    cp: { id, name: cp.name, kind: cp.kind, bin: cp.bin, address: cp.address, debtLimit: Number(cp.debtLimit) },
    isClient, isSupplier,
    balance: { ...bal, overdueDays: overdue },
    totals: { shipped: Number(tot.shipped), returned: Number(tot.returned), paid: Number(tot.paid), lastPay: tot.last_pay, lastShip: tot.last_ship },
    manager: manager ?? null,
    orders: orders.map((o) => ({ ...o, total: Number(o.total), paid: Number(o.paid), shipped: Number(o.shipped), items: orderItems.get(o.id) ?? [] })),
    shipments: shipments.map((s) => ({ ...s, total: Number(s.total), items: shipmentItems.get(s.id) ?? [] })),
    receipts: receipts.map((r) => ({ ...r, total: Number(r.total) })),
    payments: payments.map((x) => ({ ...x, amount: Number(x.amount) })),
    recon: { from: recon.from, to: recon.to, side: recon.side, opening: recon.opening, debit: recon.debit, credit: recon.credit, closing: recon.closing, rows: recon.rows.map(({ link: _l, ...r }) => r) },
  };
}

function push(m: Map<number, Item[]>, key: number, r: Item) {
  const list = m.get(key) ?? [];
  list.push({ name: r.name, unit: r.unit, qty: Number(r.qty), price: Number(r.price) });
  m.set(key, list);
}

/** Каталог для кабинета: продажная цена клиента (по его сегменту), остаток и ожидаемый приход. Закупка не раскрывается. */
export async function portalCatalog(db: DB, cpId: number, params: { q?: string; folder?: number; inStock?: boolean; page?: number }) {
  const { defaultPriceType } = await import("@/modules/orders/service");
  const { folderDescendants } = await import("@/modules/products/service");
  const { stockSql, incomingSql } = await import("@/modules/stock/queries");
  const [pt] = await q<{ id: number; name: string; is_purchase: boolean }>(db, sql`select id, name, is_purchase from price_types where id = ${(await defaultPriceType(db, cpId)) ?? -1}`);
  if (!pt || pt.is_purchase) return null;
  const size = 50, page = Math.max(1, params.page ?? 1);
  const allFolders = await q<{ id: number; name: string; parent_id: number | null }>(db, sql`select id, name, parent_id from folders order by sort, name`);
  const byId = new Map(allFolders.map((f) => [f.id, f]));
  const path = (id: number | null): string => { const f = id ? byId.get(id) : null; return f ? (f.parent_id ? `${path(f.parent_id)} / ${f.name}` : f.name) : ""; };
  const ids = params.folder && byId.has(params.folder) ? await folderDescendants(db, params.folder) : null;
  const term = params.q ? norm(params.q).slice(0, 100) : "";
  const where = sql`p.deleted_at is null and p.active and pp.value > 0
    ${ids ? sql`and p.folder_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}
    ${term ? sql`and (p.search_text like ${"%" + term + "%"} or lower(p.name) like ${"%" + term + "%"} or lower(coalesce(p.sku, '')) like ${"%" + term + "%"})` : sql``}
    ${params.inStock ? sql`and coalesce(s.qty, 0) > 0` : sql``}`;
  const from = sql`products p join product_prices pp on pp.product_id = p.id and pp.price_type_id = ${pt.id}
    left join ${stockSql()} s on s.product_id = p.id left join ${incomingSql()} inc on inc.product_id = p.id`;
  const rows = await q<{ id: number; name: string; sku: string | null; unit: string; folder_id: number | null; price: number; stock: number; incoming: number | null; eta: string | null }>(db, sql`
    select p.id, p.name, p.sku, p.unit, p.folder_id, pp.value::float8 price, coalesce(s.qty, 0)::float8 stock, inc.qty::float8 incoming, inc.eta::text eta
    from ${from} where ${where} order by (coalesce(s.qty, 0) > 0) desc, p.name limit ${size} offset ${(page - 1) * size}`);
  const [{ c }] = await q<{ c: number }>(db, sql`select count(*)::int c from ${from} where ${where}`);
  return {
    priceType: pt.name, page, pageSize: size, total: Number(c),
    folders: allFolders.filter((f) => !f.parent_id).map((f) => ({ id: f.id, name: f.name })),
    rows: rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, unit: r.unit, folder: path(r.folder_id), price: Number(r.price), stock: Math.max(0, Number(r.stock)), incoming: r.incoming ? Number(r.incoming) : 0, eta: r.eta })),
  };
}
