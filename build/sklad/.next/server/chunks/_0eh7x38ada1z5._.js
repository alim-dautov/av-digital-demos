module.exports=[55744,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},80473,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},4147,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},205,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},6033,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},8383,e=>{"use strict";async function t(e,t){let i=await e.execute(t);return Array.isArray(i)?i:i.rows??[]}e.s(["q",0,t])},24285,e=>{"use strict";var t=e.i(18916);async function i(e,i,r,s,n,a,d){await e.insert(t.auditLog).values({userId:i?.id??null,tokenId:i?.tokenId??null,action:r,entity:s,entityId:null==n?null:String(n),summary:a,data:d??null})}e.s(["f",0,i])},7130,e=>{"use strict";var t=e.i(75225),i=e.i(18916);let r={company:{name:"Electro Demo",legalName:"ТОО «Electro Demo»",bin:"",address:"г. Алматы",phone:"",email:"",bank:"",iban:"",bik:"",director:"",website:"",stamp:"auto",stampFileId:null,signatureFileId:null},debtPolicy:{mode:"warn"},payroll:{employeesSeeOwn:!0,selfCheckin:!1,periodKind:"month",penaltyBase:0,penaltyStep:0},leads:{staleDays:3},tasks:{dueSoonHours:24},search:{synonyms:"перфоратор = перф\nболгарка = ушм = угловая шлифмашина\nшуруповерт = шурик\nудлинитель = переноска\nавтомат = автоматический выключатель"}};async function s(e,s){let[n]=await e.select().from(i.settings).where((0,t.u)(i.settings.key,s)),a=r[s];return n?"object"==typeof a?{...a,...n.value}:n.value:a}async function n(e,t,r){await e.insert(i.settings).values({key:t,value:r}).onConflictDoUpdate({target:i.settings.key,set:{value:r,updatedAt:new Date}})}e.s(["I",0,r,"u",0,s,"F",0,n])},95343,e=>{"use strict";var t=e.i(18899),i=e.i(36328);e.s(["incomingSql",0,function(){return t.B`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,i.today)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(e=(0,i.today)()){return t.B`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${e}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(e,r){return t.B`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(e=(0,i.today)(),r){let s=e=>r?t.B.raw(` and ${e}.warehouse_id = ${Number(r)}`):t.B.raw("");return t.B`(
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
  )`}(e,r)} m group by m.product_id)`}])}];

//# sourceMappingURL=_0eh7x38ada1z5._.js.map