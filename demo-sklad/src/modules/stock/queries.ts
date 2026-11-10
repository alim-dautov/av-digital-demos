import { sql, type SQL } from "drizzle-orm";
import { today } from "@/lib/format";

/**
 * Подзапрос движений товара: проведённые приёмки (+, дата ≤ asOf), отгрузки (−), возвраты (+), инвентаризации (±).
 * Возвращает (product_id, warehouse_id, qty).
 */
export function movementsSql(asOf: string = today(), warehouseId?: number): SQL {
  const wh = (alias: string) => (warehouseId ? sql.raw(` and ${alias}.warehouse_id = ${Number(warehouseId)}`) : sql.raw(""));
  return sql`(
    select ri.product_id, r.warehouse_id, ri.qty::numeric as q, r.date as d, 'receipt' as src
      from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${asOf}${wh("r")}
    union all
    select si.product_id, s.warehouse_id, case when s.kind = 'return' then si.qty else -si.qty end, s.date, s.kind
      from shipment_items si join shipments s on s.id = si.shipment_id
      where s.posted and s.deleted_at is null and s.date <= ${asOf}${wh("s")}
    union all
    select ii.product_id, i.warehouse_id, ii.actual - ii.expected, i.date, 'inventory'
      from inventory_items ii join inventories i on i.id = ii.inventory_id
      where i.posted and i.deleted_at is null and i.date <= ${asOf}${wh("i")}
  )`;
}

/** Остаток по товарам: (product_id, qty) */
export function stockSql(asOf?: string, warehouseId?: number): SQL {
  return sql`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${movementsSql(asOf, warehouseId)} m group by m.product_id)`;
}

/** Ожидается по приёмкам с датой наперёд (проведены, но дата > сегодня) */
export function incomingSql(): SQL {
  return sql`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${today()}
    group by ri.product_id)`;
}

/** Последняя закупочная цена по приёмке на дату (date ≤ asOf) */
export function lastPurchaseSql(asOf: string = today()): SQL {
  return sql`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${asOf}
    order by ri.product_id, r.date desc, r.id desc)`;
}
