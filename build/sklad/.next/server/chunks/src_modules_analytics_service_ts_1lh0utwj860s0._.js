module.exports=[85933,e=>{"use strict";var t=e.i(18899),r=e.i(8383),n=e.i(11329),i=e.i(36328),s=e.i(95343),d=e.i(64582);function a(e,r){return t.B`(
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
    where s.posted and s.deleted_at is null and s.date between ${e} and ${r}
  )`}async function o(e,s,d,l,c="day",u={}){(0,n.h)(s,"analytics");let m=(0,n.V)(s,"seeProfit"),p="day"===c?t.B`l.date::date`:"week"===c?t.B`date_trunc('week', l.date::timestamp)::date`:t.B`date_trunc('month', l.date::timestamp)::date`,_=t.B`where true ${u.managerId?t.B`and l.manager_id = ${u.managerId}`:t.B``} ${u.segment?t.B`and l.segment = ${u.segment}`:t.B``}`,f=await (0,r.q)(e,t.B`
    select ${p}::text d, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost,
      count(*) filter (where l.estimated)::int estimated, count(distinct l.shipment_id)::int shipments
    from ${a(d,l)} l ${_} group by 1 order by 1`);if("day"===c){let e=new Set(f.map(e=>e.d));for(let t=d;t<=l;t=(0,i.addDays)(t,1))e.has(t)||f.push({d:t,revenue:0,cost:0,estimated:0,shipments:0});f.sort((e,t)=>e.d.localeCompare(t.d))}let h=f.map(e=>({d:e.d,revenue:Number(e.revenue),cost:m?Number(e.cost):null,profit:m?Number(e.revenue)-Number(e.cost):null,estimated:e.estimated,shipments:e.shipments})),y=h.reduce((e,t)=>({revenue:e.revenue+t.revenue,cost:e.cost+(t.cost??0),estimated:e.estimated+t.estimated}),{revenue:0,cost:0,estimated:0});return{series:h,revenue:y.revenue,cost:m?y.cost:null,profit:m?y.revenue-y.cost:null,estimatedLines:y.estimated,marginPct:m&&y.revenue?(y.revenue-y.cost)/y.revenue*100:null}}async function l(e,i,s,d){(0,n.h)(i,"analytics");let o=(0,n.V)(i,"seeProfit");return(await (0,r.q)(e,t.B`
    select l.segment, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(distinct l.shipment_id)::int orders
    from ${a(s,d)} l group by l.segment order by revenue desc`)).map(e=>({segment:e.segment,revenue:Number(e.revenue),profit:o?Number(e.revenue)-Number(e.cost):null,orders:e.orders}))}async function c(e,i,s,d,o,l=50){(0,n.h)(i,"analytics");let u=(0,n.V)(i,"seeProfit"),m={client:t.B`l.counterparty_id::text as id, l.cp_name as name`,product:t.B`l.product_id::text as id, l.product_name as name`,folder:t.B`coalesce(l.folder_id,0)::text as id, coalesce(f.name, 'Без папки') as name`,shipment:t.B`l.shipment_id::text as id, ('Отгрузка №' || s.number || ' · ' || l.cp_name) as name`,manager:t.B`coalesce(l.manager_id,0)::text as id, coalesce(u.name, 'Без менеджера') as name`}[s];return(await (0,r.q)(e,t.B`
    select ${m}, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(*) filter (where l.estimated)::int estimated
    from ${a(d,o)} l left join folders f on f.id = l.folder_id left join users u on u.id = l.manager_id left join shipments s on s.id = l.shipment_id
    group by 1, 2 order by revenue desc limit ${l}`)).map(e=>{let t=Number(e.revenue),r=Number(e.cost);return{id:e.id,name:e.name,revenue:t,cost:u?r:null,profit:u?t-r:null,marginPct:u&&t?(t-r)/t*100:null,estimated:e.estimated}})}async function u(e,i,s,d){(0,n.h)(i,"stock");let o=await (0,r.q)(e,t.B`
    select l.product_id, l.product_name as name, round(sum(l.revenue))::float8 revenue, 0 as qty
    from ${a(s,d)} l group by 1, 2 having sum(l.revenue) > 0 order by revenue desc`),l=o.reduce((e,t)=>e+Number(t.revenue),0),c=0;return{total:l,rows:o.map(e=>{c+=Number(e.revenue);let t=l?c/l*100:0;return{productId:e.product_id,name:e.name,revenue:Number(e.revenue),sharePct:l?Number(e.revenue)/l*100:0,cumulativePct:t,group:t<=80?"A":t<=95?"B":"C"}})}}async function m(e,s,d=(0,i.today)()){(0,n.h)(s,"analytics");let o=(0,i.weekRange)(d),l=await (0,r.q)(e,t.B`
    select u.id, u.name, u.color, u.weekly_plan::float8 plan,
      coalesce((select round(sum(l.revenue)) from ${a(o.start,o.end)} l where l.manager_id = u.id), 0)::float8 revenue,
      (select count(*)::int from orders o where o.manager_id = u.id and o.deleted_at is null and (o.created_at at time zone 'Asia/Almaty')::date between ${o.start} and ${o.end}) orders
    from users u where u.is_sales_manager and u.active and u.deleted_at is null order by u.name`);return{...o,rows:l.map(e=>({...e,plan:Number(e.plan),revenue:Number(e.revenue),pct:Number(e.plan)?Number(e.revenue)/Number(e.plan)*100:0}))}}async function p(e,i,s,d){(0,n.h)(i,"analytics");let a=await o(e,i,s,d,"day"),[l]=await (0,r.q)(e,t.B`select count(*)::int orders, coalesce(sum(total),0)::float8 sum from orders
    where deleted_at is null and (created_at at time zone 'Asia/Almaty')::date between ${s} and ${d}`),c=await (0,r.q)(e,t.B`select st.name, st.kind, st.sort, count(l.id)::int c from lead_stages st
    left join leads l on l.stage_id = st.id and l.deleted_at is null and (l.created_at at time zone 'Asia/Almaty')::date between ${s} and ${d}
    group by st.id order by st.sort`),u=c.reduce((e,t)=>e+t.c,0),m=c.filter(e=>"won"===e.kind||/заявк/i.test(e.name)).reduce((e,t)=>e+t.c,0);return{revenue:a.revenue,profit:a.profit,marginPct:a.marginPct,series:a.series,orders:l?.orders??0,ordersSum:Number(l?.sum??0),avgCheck:l?.orders?100*Math.round(Number(l.sum)/l.orders/100):0,funnel:c,conversionPct:u?m/u*100:0}}async function _(e,i,s,a){(0,n.h)(i,"analytics");let o=await (0,d.R)(e,s,a);return(await (0,r.q)(e,t.B`select id, name, color from users where active and deleted_at is null order by name`)).map(e=>{let t=o.find(t=>t.user_id===e.id);return{...e,open:t?.open??0,overdue:t?.overdue??0,done:t?.done??0,onTimePct:t?.with_due?t.on_time/t.with_due*100:null,avgHours:Number(t?.avg_hours??0)}})}let f=()=>t.B`(select distinct on (ri.product_id) ri.product_id, ri.price
  from receipt_items ri join receipts r on r.id = ri.receipt_id
  where r.posted and r.deleted_at is null and ri.price > 0
  order by ri.product_id, r.date desc, r.id desc)`;async function h(e,d,a){(0,n.h)(d,"stock");let o=(0,n.V)(d,"seePurchase"),l=Math.max(1,a.page??1),c=[t.B`p.deleted_at is null`];if(a.folderIds?.length&&c.push(t.B`p.folder_id in (${t.B.join(a.folderIds.map(e=>t.B`${e}`),t.B`, `)})`),a.q)for(let e of a.q.toLowerCase().split(/\s+/).filter(Boolean))c.push(t.B`p.search_text like ${"%"+e+"%"}`);"negative"===a.tab&&c.push(t.B`coalesce(s.qty,0) < 0`),"low"===a.tab&&c.push(t.B`coalesce(s.qty,0) < p.min_stock and p.min_stock > 0`),"instock"===a.tab&&c.push(t.B`coalesce(s.qty,0) > 0`);let u=t.B.join(c,t.B` and `),m=await (0,r.q)(e,t.B`
    select p.id, p.name, p.sku, p.unit, f.name folder, coalesce(s.qty,0)::float8 qty, p.min_stock::float8, coalesce(lp.price, cp.value, 0)::float8 cost, inc.qty incoming, inc.eta::text eta
    from products p left join folders f on f.id = p.folder_id
      left join ${(0,s.stockSql)(void 0,a.warehouseId)} s on s.product_id = p.id
      left join (select ri.product_id, sum(ri.qty)::float8 qty, min(r.date) eta from receipt_items ri join receipts r on r.id = ri.receipt_id
        where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,i.today)()} group by ri.product_id) inc on inc.product_id = p.id
      left join ${f()} lp on lp.product_id = p.id
      left join (select distinct on (pp.product_id) pp.product_id, pp.value from product_prices pp join price_types pt on pt.id = pp.price_type_id where pt.is_purchase) cp on cp.product_id = p.id
    where ${u} order by ${"negative"===a.tab?t.B`qty asc`:t.B`p.name`} limit ${50} offset ${(l-1)*50}`),[p]=await (0,r.q)(e,t.B`select count(*)::int c, coalesce(sum(greatest(coalesce(s.qty,0),0) * coalesce(lp.price,0)),0)::float8 value
    from products p left join ${(0,s.stockSql)(void 0,a.warehouseId)} s on s.product_id = p.id
    left join ${f()} lp on lp.product_id = p.id
    where ${u}`);return{rows:m.map(e=>({...e,qty:Number(e.qty),min_stock:Number(e.min_stock),cost:o?Number(e.cost):null,incoming:null==e.incoming?null:Number(e.incoming)})),total:p?.c??0,value:o?Number(p?.value??0):null,page:l,pageSize:50}}e.s(["S",0,u,"f",0,l,"s",0,()=>({from:(0,i.addDays)((0,i.today)(),-29),to:(0,i.today)()}),"b",0,p,"w",0,m,"i",0,c,"x",0,o,"Q",0,h,"l",0,_])}];

//# sourceMappingURL=src_modules_analytics_service_ts_1lh0utwj860s0._.js.map