import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { assertCan, flag, type Principal } from "@/lib/rbac";
import { addDays, today, weekRange } from "@/lib/format";
import { stockSql } from "@/modules/stock/queries";
import { taskStats } from "@/modules/tasks/service";

/**
 * Строки продаж с эффективной себестоимостью: если в отгрузке закупка = 0,
 * подставляем последнюю закупку из приёмки или карточки и помечаем «расчётная».
 */
function salesLines(from: string, to: string) {
  return sql`(
    select s.id shipment_id, s.date, s.kind, s.counterparty_id, s.order_id, c.segment, c.name cp_name,
      coalesce(o.manager_id, c.manager_id) manager_id, si.product_id, p.folder_id, p.name product_name,
      (case when s.kind='return' then -1 else 1 end) * si.qty * si.price as revenue,
      -- себестоимость зафиксирована в строке; подзапросы выполняются только для строк без неё (CASE не вычисляет лишнее)
      (case when s.kind='return' then -1 else 1 end) * si.qty * (case when si.cost > 0 then si.cost else coalesce(
        (select ri.price from receipt_items ri join receipts r on r.id = ri.receipt_id
          where ri.product_id = si.product_id and r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 order by r.date desc, r.id desc limit 1),
        (select pp.value from product_prices pp join price_types pt on pt.id = pp.price_type_id where pt.is_purchase and pp.product_id = si.product_id limit 1),
        0) end) as cost,
      (si.cost = 0 or si.cost_estimated) as estimated
    from shipments s join shipment_items si on si.shipment_id = s.id join products p on p.id = si.product_id
      join counterparties c on c.id = s.counterparty_id left join orders o on o.id = s.order_id
    where s.posted and s.deleted_at is null and s.date between ${from} and ${to}
  )`;
}

export async function profitReport(db: DB, p: Principal, from: string, to: string, group: "day" | "week" | "month" = "day", filters: { managerId?: number; segment?: string } = {}) {
  assertCan(p, "analytics");
  const seeProfit = flag(p, "seeProfit");
  const trunc = group === "day" ? sql`l.date::date` : group === "week" ? sql`date_trunc('week', l.date::timestamp)::date` : sql`date_trunc('month', l.date::timestamp)::date`;
  const where = sql`where true ${filters.managerId ? sql`and l.manager_id = ${filters.managerId}` : sql``} ${filters.segment ? sql`and l.segment = ${filters.segment}` : sql``}`;
  const rows = await q<{ d: string; revenue: number; cost: number; estimated: number; shipments: number }>(db, sql`
    select ${trunc}::text d, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost,
      count(*) filter (where l.estimated)::int estimated, count(distinct l.shipment_id)::int shipments
    from ${salesLines(from, to)} l ${where} group by 1 order by 1`);
  // для дневной группировки заполняем пропуски нулями, чтобы график был непрерывным
  if (group === "day") {
    const have = new Set(rows.map((r) => r.d));
    for (let d = from; d <= to; d = addDays(d, 1)) if (!have.has(d)) rows.push({ d, revenue: 0, cost: 0, estimated: 0, shipments: 0 });
    rows.sort((a, b) => a.d.localeCompare(b.d));
  }
  const series = rows.map((r) => ({ d: r.d, revenue: Number(r.revenue), cost: seeProfit ? Number(r.cost) : null, profit: seeProfit ? Number(r.revenue) - Number(r.cost) : null, estimated: r.estimated, shipments: r.shipments }));
  const total = series.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + (r.cost ?? 0), estimated: a.estimated + r.estimated }), { revenue: 0, cost: 0, estimated: 0 });
  return { series, revenue: total.revenue, cost: seeProfit ? total.cost : null, profit: seeProfit ? total.revenue - total.cost : null, estimatedLines: total.estimated, marginPct: seeProfit && total.revenue ? ((total.revenue - total.cost) / total.revenue) * 100 : null };
}

export async function bySegment(db: DB, p: Principal, from: string, to: string) {
  assertCan(p, "analytics");
  const seeProfit = flag(p, "seeProfit");
  const rows = await q<{ segment: string; revenue: number; cost: number; orders: number }>(db, sql`
    select l.segment, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(distinct l.shipment_id)::int orders
    from ${salesLines(from, to)} l group by l.segment order by revenue desc`);
  return rows.map((r) => ({ segment: r.segment, revenue: Number(r.revenue), profit: seeProfit ? Number(r.revenue) - Number(r.cost) : null, orders: r.orders }));
}

/** Маржа по разрезу: client | product | folder | shipment | manager */
export async function marginBy(db: DB, p: Principal, dim: "client" | "product" | "folder" | "shipment" | "manager", from: string, to: string, limit = 50) {
  assertCan(p, "analytics");
  const seeProfit = flag(p, "seeProfit");
  const key = {
    client: sql`l.counterparty_id::text as id, l.cp_name as name`,
    product: sql`l.product_id::text as id, l.product_name as name`,
    folder: sql`coalesce(l.folder_id,0)::text as id, coalesce(f.name, 'Без папки') as name`,
    shipment: sql`l.shipment_id::text as id, ('Отгрузка №' || s.number || ' · ' || l.cp_name) as name`,
    manager: sql`coalesce(l.manager_id,0)::text as id, coalesce(u.name, 'Без менеджера') as name`,
  }[dim];
  const rows = await q<{ id: string; name: string; revenue: number; cost: number; estimated: number }>(db, sql`
    select ${key}, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(*) filter (where l.estimated)::int estimated
    from ${salesLines(from, to)} l left join folders f on f.id = l.folder_id left join users u on u.id = l.manager_id left join shipments s on s.id = l.shipment_id
    group by 1, 2 order by revenue desc limit ${limit}`);
  return rows.map((r) => {
    const revenue = Number(r.revenue), cost = Number(r.cost);
    return { id: r.id, name: r.name, revenue, cost: seeProfit ? cost : null, profit: seeProfit ? revenue - cost : null, marginPct: seeProfit && revenue ? ((revenue - cost) / revenue) * 100 : null, estimated: r.estimated };
  });
}

/** ABC-анализ по выручке: A — 80%, B — 15%, C — 5% */
export async function abc(db: DB, p: Principal, from: string, to: string) {
  assertCan(p, "stock");
  const rows = await q<{ product_id: number; name: string; revenue: number; qty: number }>(db, sql`
    select l.product_id, l.product_name as name, round(sum(l.revenue))::float8 revenue, 0 as qty
    from ${salesLines(from, to)} l group by 1, 2 having sum(l.revenue) > 0 order by revenue desc`);
  const total = rows.reduce((s, r) => s + Number(r.revenue), 0);
  let acc = 0;
  return {
    total,
    rows: rows.map((r) => {
      acc += Number(r.revenue);
      const share = total ? (acc / total) * 100 : 0;
      return { productId: r.product_id, name: r.name, revenue: Number(r.revenue), sharePct: total ? (Number(r.revenue) / total) * 100 : 0, cumulativePct: share, group: share <= 80 ? "A" : share <= 95 ? "B" : "C" };
    }),
  };
}

/** Менеджеры против недельного плана */
export async function managersVsPlan(db: DB, p: Principal, weekOf: string = today()) {
  assertCan(p, "analytics");
  const w = weekRange(weekOf);
  const rows = await q<{ id: number; name: string; color: string; plan: number; revenue: number; orders: number }>(db, sql`
    select u.id, u.name, u.color, u.weekly_plan::float8 plan,
      coalesce((select round(sum(l.revenue)) from ${salesLines(w.start, w.end)} l where l.manager_id = u.id), 0)::float8 revenue,
      (select count(*)::int from orders o where o.manager_id = u.id and o.deleted_at is null and (o.created_at at time zone 'Asia/Almaty')::date between ${w.start} and ${w.end}) orders
    from users u where u.is_sales_manager and u.active and u.deleted_at is null order by u.name`);
  return { ...w, rows: rows.map((r) => ({ ...r, plan: Number(r.plan), revenue: Number(r.revenue), pct: Number(r.plan) ? (Number(r.revenue) / Number(r.plan)) * 100 : 0 })) };
}

/** Сводка для дашборда */
export async function kpis(db: DB, p: Principal, from: string, to: string) {
  assertCan(p, "analytics");
  const pr = await profitReport(db, p, from, to, "day");
  const [o] = await q<{ orders: number; sum: number }>(db, sql`select count(*)::int orders, coalesce(sum(total),0)::float8 sum from orders
    where deleted_at is null and (created_at at time zone 'Asia/Almaty')::date between ${from} and ${to}`);
  const funnel = await q<{ name: string; kind: string; c: number; sort: number }>(db, sql`select st.name, st.kind, st.sort, count(l.id)::int c from lead_stages st
    left join leads l on l.stage_id = st.id and l.deleted_at is null and (l.created_at at time zone 'Asia/Almaty')::date between ${from} and ${to}
    group by st.id order by st.sort`);
  const totalLeads = funnel.reduce((s, f) => s + f.c, 0);
  const won = funnel.filter((f) => f.kind === "won" || /заявк/i.test(f.name)).reduce((s, f) => s + f.c, 0);
  return {
    revenue: pr.revenue, profit: pr.profit, marginPct: pr.marginPct, series: pr.series,
    orders: o?.orders ?? 0, ordersSum: Number(o?.sum ?? 0), avgCheck: o?.orders ? Math.round(Number(o.sum) / o.orders / 100) * 100 : 0,
    funnel, conversionPct: totalLeads ? (won / totalLeads) * 100 : 0,
  };
}

/** Выполняемость задач по сотрудникам */
export async function taskPerformance(db: DB, p: Principal, from: string, to: string) {
  assertCan(p, "analytics");
  const stats = await taskStats(db, from, to);
  const ppl = await q<{ id: number; name: string; color: string }>(db, sql`select id, name, color from users where active and deleted_at is null order by name`);
  return ppl.map((u) => {
    const s = stats.find((x) => x.user_id === u.id);
    return { ...u, open: s?.open ?? 0, overdue: s?.overdue ?? 0, done: s?.done ?? 0, onTimePct: s?.with_due ? (s.on_time / s.with_due) * 100 : null, avgHours: Number(s?.avg_hours ?? 0) };
  });
}

/* ───── Склад ───── */

/** Последняя цена закупки по каждому товару — один проход вместо lateral на строку */
const lastPriceSql = () => sql`(select distinct on (ri.product_id) ri.product_id, ri.price
  from receipt_items ri join receipts r on r.id = ri.receipt_id
  where r.posted and r.deleted_at is null and ri.price > 0
  order by ri.product_id, r.date desc, r.id desc)`;

export async function stockReport(db: DB, p: Principal, params: { folderIds?: number[]; q?: string; tab?: string; warehouseId?: number; page?: number }) {
  assertCan(p, "stock");
  const seeP = flag(p, "seePurchase");
  const page = Math.max(1, params.page ?? 1), size = 50;
  const conds = [sql`p.deleted_at is null`];
  if (params.folderIds?.length) conds.push(sql`p.folder_id in (${sql.join(params.folderIds.map((i) => sql`${i}`), sql`, `)})`);
  if (params.q) for (const t of params.q.toLowerCase().split(/\s+/).filter(Boolean)) conds.push(sql`p.search_text like ${"%" + t + "%"}`);
  if (params.tab === "negative") conds.push(sql`coalesce(s.qty,0) < 0`);
  if (params.tab === "low") conds.push(sql`coalesce(s.qty,0) < p.min_stock and p.min_stock > 0`);
  if (params.tab === "instock") conds.push(sql`coalesce(s.qty,0) > 0`);
  const where = sql.join(conds, sql` and `);
  const rows = await q<{ id: number; name: string; sku: string | null; unit: string; folder: string | null; qty: number; min_stock: number; cost: number; incoming: number | null; eta: string | null }>(db, sql`
    select p.id, p.name, p.sku, p.unit, f.name folder, coalesce(s.qty,0)::float8 qty, p.min_stock::float8, coalesce(lp.price, cp.value, 0)::float8 cost, inc.qty incoming, inc.eta::text eta
    from products p left join folders f on f.id = p.folder_id
      left join ${stockSql(undefined, params.warehouseId)} s on s.product_id = p.id
      left join (select ri.product_id, sum(ri.qty)::float8 qty, min(r.date) eta from receipt_items ri join receipts r on r.id = ri.receipt_id
        where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${today()} group by ri.product_id) inc on inc.product_id = p.id
      left join ${lastPriceSql()} lp on lp.product_id = p.id
      left join (select distinct on (pp.product_id) pp.product_id, pp.value from product_prices pp join price_types pt on pt.id = pp.price_type_id where pt.is_purchase) cp on cp.product_id = p.id
    where ${where} order by ${params.tab === "negative" ? sql`qty asc` : sql`p.name`} limit ${size} offset ${(page - 1) * size}`);
  const [tot] = await q<{ c: number; value: number }>(db, sql`select count(*)::int c, coalesce(sum(greatest(coalesce(s.qty,0),0) * coalesce(lp.price,0)),0)::float8 value
    from products p left join ${stockSql(undefined, params.warehouseId)} s on s.product_id = p.id
    left join ${lastPriceSql()} lp on lp.product_id = p.id
    where ${where}`);
  return {
    rows: rows.map((r) => ({ ...r, qty: Number(r.qty), min_stock: Number(r.min_stock), cost: seeP ? Number(r.cost) : null, incoming: r.incoming == null ? null : Number(r.incoming) })),
    total: tot?.c ?? 0, value: seeP ? Number(tot?.value ?? 0) : null, page, pageSize: size,
  };
}

/** Товары «день в день»: приняты и проданы в один день */
export async function sameDay(db: DB, p: Principal, date: string = today()) {
  assertCan(p, "stock");
  return q<{ product_id: number; name: string; unit: string; received: number; sold: number }>(db, sql`
    select p.id product_id, p.name, p.unit, r.qty::float8 received, s.qty::float8 sold from products p
    join (select ri.product_id, sum(ri.qty) qty from receipt_items ri join receipts r on r.id = ri.receipt_id where r.posted and r.deleted_at is null and not ri.excluded and r.date = ${date} group by 1) r on r.product_id = p.id
    join (select si.product_id, sum(si.qty) qty from shipment_items si join shipments s on s.id = si.shipment_id where s.posted and s.deleted_at is null and s.kind='shipment' and s.date = ${date} group by 1) s on s.product_id = p.id
    order by p.name`);
}

export const defaultRange = () => ({ from: addDays(today(), -29), to: today() });
