module.exports=[95343,e=>{"use strict";var i=e.i(18899),r=e.i(36328);e.s(["incomingSql",0,function(){return i.B`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,r.today)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(e=(0,r.today)()){return i.B`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${e}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(e,t){return i.B`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(e=(0,r.today)(),t){let d=e=>t?i.B.raw(` and ${e}.warehouse_id = ${Number(t)}`):i.B.raw("");return i.B`(
    select ri.product_id, r.warehouse_id, ri.qty::numeric as q, r.date as d, 'receipt' as src
      from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${e}${d("r")}
    union all
    select si.product_id, s.warehouse_id, case when s.kind = 'return' then si.qty else -si.qty end, s.date, s.kind
      from shipment_items si join shipments s on s.id = si.shipment_id
      where s.posted and s.deleted_at is null and s.date <= ${e}${d("s")}
    union all
    select ii.product_id, i.warehouse_id, ii.actual - ii.expected, i.date, 'inventory'
      from inventory_items ii join inventories i on i.id = ii.inventory_id
      where i.posted and i.deleted_at is null and i.date <= ${e}${d("i")}
  )`}(e,t)} m group by m.product_id)`}])}];

//# sourceMappingURL=src_modules_stock_queries_ts_0op878b2urs6i._.js.map