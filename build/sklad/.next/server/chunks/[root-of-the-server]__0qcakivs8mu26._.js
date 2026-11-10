module.exports=[6928,(e,t,i)=>{t.exports=e.x("exceljs-9798f6f4656d3162",()=>require("exceljs-9798f6f4656d3162"))},55744,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},80473,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},4147,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},205,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},6033,e=>{"use strict";var t=e.i(62810);e.s(["z",0,t])},8383,e=>{"use strict";async function t(e,t){let i=await e.execute(t);return Array.isArray(i)?i:i.rows??[]}e.s(["q",0,t])},24285,e=>{"use strict";var t=e.i(18916);async function i(e,i,r,d,s,n,o){await e.insert(t.auditLog).values({userId:i?.id??null,tokenId:i?.tokenId??null,action:r,entity:d,entityId:null==s?null:String(s),summary:n,data:o??null})}e.s(["f",0,i])},29098,e=>{"use strict";var t=e.i(6928);async function i(e){let i=new t.default.Workbook;for(let t of(i.creator="Electro Demo CRM",e)){let e=i.addWorksheet(t.name.slice(0,31),{views:[{state:"frozen",ySplit:t.title?2:1}]});t.title&&(e.addRow([t.title]).font={bold:!0,size:13});let r=e.addRow(t.cols.map(e=>e.header));for(let i of(r.font={bold:!0},r.eachCell(e=>{e.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FFF5F7FA"}}}),t.cols.forEach((t,i)=>{e.getColumn(i+1).width=t.width??16,t.money&&(e.getColumn(i+1).numFmt="# ##0.##")}),t.rows))e.addRow(i.map((e,i)=>t.cols[i]?.money&&"number"==typeof e?e/100:e))}return Buffer.from(await i.xlsx.writeBuffer())}e.s(["f",0,i])},95343,e=>{"use strict";var t=e.i(18899),i=e.i(36328);e.s(["incomingSql",0,function(){return t.B`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,i.today)()}
    group by ri.product_id)`},"lastPurchaseSql",0,function(e=(0,i.today)()){return t.B`(select distinct on (ri.product_id) ri.product_id, ri.price as price, r.date as date
    from receipt_items ri join receipts r on r.id = ri.receipt_id
    where r.posted and r.deleted_at is null and not ri.excluded and ri.price > 0 and r.date <= ${e}
    order by ri.product_id, r.date desc, r.id desc)`},"stockSql",0,function(e,r){return t.B`(select m.product_id, coalesce(sum(m.q), 0)::float8 as qty from ${function(e=(0,i.today)(),r){let d=e=>r?t.B.raw(` and ${e}.warehouse_id = ${Number(r)}`):t.B.raw("");return t.B`(
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
  )`}(e,r)} m group by m.product_id)`}])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__0qcakivs8mu26._.js.map