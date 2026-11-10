module.exports=[81111,(a,b,c)=>{b.exports=a.x("node:stream",()=>require("node:stream"))},19708,(a,b,c)=>{b.exports=a.x("web-push-5043b119f048bede",()=>require("web-push-5043b119f048bede"))},13095,(a,b,c)=>{"use strict";function d(a){for(let b=0;b<a.length;b++){let c=a[b];if("function"!=typeof c)throw Error(`A "use server" file can only export async functions, found ${typeof c}.
Read more: https://nextjs.org/docs/messages/invalid-use-server-value`)}}Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"ensureServerEntryExports",{enumerable:!0,get:function(){return d}})},37936,(a,b,c)=>{"use strict";Object.defineProperty(c,"__esModule",{value:!0}),Object.defineProperty(c,"registerServerReference",{enumerable:!0,get:function(){return d.registerServerReference}});let d=a.r(11857)},83931,a=>{"use strict";var b=a.i(54757);a.s(["z",0,b])},99370,a=>{"use strict";var b=a.i(54757);a.s(["z",0,b])},79,a=>a.a(async(b,c)=>{try{var d=a.i(18558),e=a.i(49887),f=a.i(16844),g=b([f]);function h(a){return a&&"object"==typeof a&&"status"in a&&"message"in a?String(a.message):(console.error(a),"Внутренняя ошибка сервера")}[f]=g.then?(await g)():g,a.s(["action",0,function(a,b,c={}){return async g=>{try{let h=await (0,f.x)();if(!h||h.mustChangePassword)return{ok:!1,error:"Сессия истекла, войдите снова"};let i=a.safeParse(g);if(!i.success){let a;return{ok:!1,error:(a=i.error.issues[0])?`${a.path.length?a.path.join(".")+": ":""}${a.message}`:"Неверные данные"}}let j=await (0,e.f)(),k=await b(i.data,{db:j,p:h});for(let a of c.revalidate??[])(0,d.revalidatePath)(a,"layout");return{ok:!0,data:k}}catch(a){return{ok:!1,error:h(a)}}}},"errorMessage",0,h]),c()}catch(a){c(a)}},!1),14846,a=>{"use strict";var b=a.i(51674);async function c(a,c){let d=await a.execute(b.sql`
    insert into counters (key, value) values (${c}, 1)
    on conflict (key) do update set value = counters.value + 1
    returning value`);return Number((d.rows??d)[0].value)}a.s(["f",0,c])},20731,a=>{"use strict";var b=a.i(51674),c=a.i(43116);a.s(["incomingSql",0,function(){return b.sql`(select ri.product_id, sum(ri.qty)::float8 as qty, min(r.date) as eta
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

//# sourceMappingURL=%5Broot-of-the-server%5D__0p_wpqlsxz9v2._.js.map