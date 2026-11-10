module.exports=[55744,e=>{"use strict";var r=e.i(62810);e.s(["z",0,r])},80473,e=>{"use strict";var r=e.i(62810);e.s(["z",0,r])},4147,e=>{"use strict";var r=e.i(62810);e.s(["z",0,r])},205,e=>{"use strict";var r=e.i(62810);e.s(["z",0,r])},6033,e=>{"use strict";var r=e.i(62810);e.s(["z",0,r])},8383,e=>{"use strict";async function r(e,r){let i=await e.execute(r);return Array.isArray(i)?i:i.rows??[]}e.s(["q",0,r])},24285,e=>{"use strict";var r=e.i(18916);async function i(e,i,s,t,d,n,a){await e.insert(r.auditLog).values({userId:i?.id??null,tokenId:i?.tokenId??null,action:s,entity:t,entityId:null==d?null:String(d),summary:n,data:a??null})}e.s(["f",0,i])},47824,e=>{e.v(e=>Promise.resolve().then(()=>e(36328)))},47835,e=>{e.v(r=>Promise.all(["server/chunks/_1nvuahkl4efzz._.js","server/chunks/src_modules_shipments_service_ts_1_-_edb46lkj6._.js","server/chunks/src_modules_webhooks_service_ts_0u0xvfm6tk8on._.js","server/chunks/src_modules_counterparties_service_ts_04fheeihrsjhk._.js","server/chunks/src_modules_products_service_ts_0jzau9fexrloy._.js","server/chunks/node_modules_zod_v4_classic_external_1h9u5hd8e7zk0.js","server/chunks/src_01ltojg3sl5z2._.js"].map(r=>e.l(r))).then(()=>r(59887)))},95343,e=>{"use strict";var r=e.i(18899),i=e.i(36328);e.s(["incomingSql",0,function(){return r.B`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,i.today)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(e=(0,i.today)()){return r.B`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${e}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(e,s){return r.B`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(e=(0,i.today)(),s){let t=e=>s?r.B.raw(` and ${e}.warehouse_id = ${Number(s)}`):r.B.raw("");return r.B`(
    select ri.product_id, r.warehouse_id, ri.qty::numeric as q, r.date as d, 'receipt' as src
      from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${e}${t("r")}
    union all
    select si.product_id, s.warehouse_id, case when s.kind = 'return' then si.qty else -si.qty end, s.date, s.kind
      from shipment_items si join shipments s on s.id = si.shipment_id
      where s.posted and s.deleted_at is null and s.date <= ${e}${t("s")}
    union all
    select ii.product_id, i.warehouse_id, ii.actual - ii.expected, i.date, 'inventory'
      from inventory_items ii join inventories i on i.id = ii.inventory_id
      where i.posted and i.deleted_at is null and i.date <= ${e}${t("i")}
  )`}(e,s)} m group by m.product_id)`}])}];

//# sourceMappingURL=_0zy8lnk85_u8k._.js.map