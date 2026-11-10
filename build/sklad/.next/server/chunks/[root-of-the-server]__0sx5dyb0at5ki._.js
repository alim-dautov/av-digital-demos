module.exports=[44950,e=>e.a(async(t,r)=>{try{var i=await e.y("bcryptjs-ee66c2bdc904f2cf");e.n(i),r()}catch(e){r(e)}},!0),6928,(e,t,r)=>{t.exports=e.x("exceljs-9798f6f4656d3162",()=>require("exceljs-9798f6f4656d3162"))},66680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},50227,(e,t,r)=>{t.exports=e.x("node:path",()=>require("node:path"))},55744,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},80473,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},4147,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},205,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},6033,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},8383,e=>{"use strict";async function t(e,t){let r=await e.execute(t);return Array.isArray(r)?r:r.rows??[]}e.s(["q",0,t])},24285,e=>{"use strict";var t=e.i(18916);async function r(e,r,i,s,n,a,d){await e.insert(t.auditLog).values({userId:r?.id??null,tokenId:r?.tokenId??null,action:i,entity:s,entityId:null==n?null:String(n),summary:a,data:d??null})}e.s(["f",0,r])},96608,e=>e.a(async(t,r)=>{try{var i=e.i(89171),s=e.i(42389),n=e.i(66663),a=e.i(15394),d=t([n,a]);[n,a]=d.then?(await d)():d,e.s(["O",0,"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","$",0,function(e,t,r,i=!1){return new Response(new Uint8Array(e),{headers:{"content-type":r,"content-disposition":`${i?"inline":"attachment"}; filename*=UTF-8''${encodeURIComponent(t)}`,"cache-control":"private, no-store"}})},"g",0,function(e){return async(t,r)=>{let d=await (0,n.x)();if(!d||d.mustChangePassword)return i.NextResponse.json({error:"Требуется вход"},{status:401});try{return await e(t,{db:await (0,s.$)(),p:d,params:await r.params})}catch(t){let e=t.status??500;return i.NextResponse.json({error:(0,a.f)(t)},{status:e})}}}]),r()}catch(e){r(e)}},!1),95343,e=>{"use strict";var t=e.i(18899),r=e.i(36328);e.s(["incomingSql",0,function(){return t.B`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,r.today)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(e=(0,r.today)()){return t.B`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${e}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(e,i){return t.B`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(e=(0,r.today)(),i){let s=e=>i?t.B.raw(` and ${e}.warehouse_id = ${Number(i)}`):t.B.raw("");return t.B`(
    select ri.product_id, r.warehouse_id, ri.qty::numeric as q, r.date as d, 'receipt' as src
      from receipt_items ri join receipts r on r.id = ri.receipt_id
      where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${e}${s("r")}
    union all
    select si.product_id, s.warehouse_id, case when s.kind = 'return' then si.qty else -si.qty end, s.date, s.kind
      from shipment_items si join shipments s on s.id = si.shipment_id
      where s.posted and s.deleted_at is null and s.date <= ${e}${s("s")}
    union all
    select ii.product_id, i.warehouse_id, ii.actual - ii.expected, i.date, 'inventory'
      from inventory_items ii join inventories i on i.id = ii.inventory_id
      where i.posted and i.deleted_at is null and i.date <= ${e}${s("i")}
  )`}(e,i)} m group by m.product_id)`}])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0sx5dyb0at5ki._.js.map