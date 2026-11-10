module.exports=[83931,a=>{"use strict";var b=a.i(54757);a.s(["z",0,b])},99370,a=>{"use strict";var b=a.i(54757);a.s(["z",0,b])},20731,a=>{"use strict";var b=a.i(51674),c=a.i(43116);a.s(["incomingSql",0,function(){return b.sql`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,c.W)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(a=(0,c.W)()){return b.sql`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${a}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(a,d){return b.sql`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(a=(0,c.W)(),d){let e=a=>d?b.sql.raw(` and ${a}.warehouse_id = ${Number(d)}`):b.sql.raw("");return b.sql`(
    select ri.product_id, r.warehouse_id, ri.qty::numeric as q, r.date as d, 'receipt' as src
      from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${a}${e("r")}
    union all
    select si.product_id, s.warehouse_id, case when s.kind = 'return' then si.qty else -si.qty end, s.date, s.kind
      from shipment_items si join shipments s on s.id = si.shipment_id
      where s.posted and s.deleted_at is null and s.date <= ${a}${e("s")}
    union all
    select ii.product_id, i.warehouse_id, ii.actual - ii.expected, i.date, 'inventory'
      from inventory_items ii join inventories i on i.id = ii.inventory_id
      where i.posted and i.deleted_at is null and i.date <= ${a}${e("i")}
  )`}(a,d)} m group by m.product_id)`}])}];

//# sourceMappingURL=_1g9rpqby0lrq6._.js.map