module.exports=[19014,a=>{"use strict";var b=a.i(51674),c=a.i(61884),d=a.i(22239),e=a.i(43116),f=a.i(20731),g=a.i(10270);function h(a,c){return b.sql`(
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
    where s.posted and s.deleted_at is null and s.date between ${a} and ${c}
  )`}async function i(a,f,g,j,k="day",l={}){(0,d.assertCan)(f,"analytics");let m=(0,d.flag)(f,"seeProfit"),n="day"===k?b.sql`l.date::date`:"week"===k?b.sql`date_trunc('week', l.date::timestamp)::date`:b.sql`date_trunc('month', l.date::timestamp)::date`,o=b.sql`where true ${l.managerId?b.sql`and l.manager_id = ${l.managerId}`:b.sql``} ${l.segment?b.sql`and l.segment = ${l.segment}`:b.sql``}`,p=await (0,c.q)(a,b.sql`
    select ${n}::text d, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost,
      count(*) filter (where l.estimated)::int estimated, count(distinct l.shipment_id)::int shipments
    from ${h(g,j)} l ${o} group by 1 order by 1`);if("day"===k){let a=new Set(p.map(a=>a.d));for(let b=g;b<=j;b=(0,e.b)(b,1))a.has(b)||p.push({d:b,revenue:0,cost:0,estimated:0,shipments:0});p.sort((a,b)=>a.d.localeCompare(b.d))}let q=p.map(a=>({d:a.d,revenue:Number(a.revenue),cost:m?Number(a.cost):null,profit:m?Number(a.revenue)-Number(a.cost):null,estimated:a.estimated,shipments:a.shipments})),r=q.reduce((a,b)=>({revenue:a.revenue+b.revenue,cost:a.cost+(b.cost??0),estimated:a.estimated+b.estimated}),{revenue:0,cost:0,estimated:0});return{series:q,revenue:r.revenue,cost:m?r.cost:null,profit:m?r.revenue-r.cost:null,estimatedLines:r.estimated,marginPct:m&&r.revenue?(r.revenue-r.cost)/r.revenue*100:null}}async function j(a,e,f,g){(0,d.assertCan)(e,"analytics");let i=(0,d.flag)(e,"seeProfit");return(await (0,c.q)(a,b.sql`
    select l.segment, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(distinct l.shipment_id)::int orders
    from ${h(f,g)} l group by l.segment order by revenue desc`)).map(a=>({segment:a.segment,revenue:Number(a.revenue),profit:i?Number(a.revenue)-Number(a.cost):null,orders:a.orders}))}async function k(a,e,f,g,i,j=50){(0,d.assertCan)(e,"analytics");let l=(0,d.flag)(e,"seeProfit"),m={client:b.sql`l.counterparty_id::text as id, l.cp_name as name`,product:b.sql`l.product_id::text as id, l.product_name as name`,folder:b.sql`coalesce(l.folder_id,0)::text as id, coalesce(f.name, 'Без папки') as name`,shipment:b.sql`l.shipment_id::text as id, ('Отгрузка №' || s.number || ' · ' || l.cp_name) as name`,manager:b.sql`coalesce(l.manager_id,0)::text as id, coalesce(u.name, 'Без менеджера') as name`}[f];return(await (0,c.q)(a,b.sql`
    select ${m}, round(sum(l.revenue))::float8 revenue, round(sum(l.cost))::float8 cost, count(*) filter (where l.estimated)::int estimated
    from ${h(g,i)} l left join folders f on f.id = l.folder_id left join users u on u.id = l.manager_id left join shipments s on s.id = l.shipment_id
    group by 1, 2 order by revenue desc limit ${j}`)).map(a=>{let b=Number(a.revenue),c=Number(a.cost);return{id:a.id,name:a.name,revenue:b,cost:l?c:null,profit:l?b-c:null,marginPct:l&&b?(b-c)/b*100:null,estimated:a.estimated}})}async function l(a,e,f,g){(0,d.assertCan)(e,"stock");let i=await (0,c.q)(a,b.sql`
    select l.product_id, l.product_name as name, round(sum(l.revenue))::float8 revenue, 0 as qty
    from ${h(f,g)} l group by 1, 2 having sum(l.revenue) > 0 order by revenue desc`),j=i.reduce((a,b)=>a+Number(b.revenue),0),k=0;return{total:j,rows:i.map(a=>{k+=Number(a.revenue);let b=j?k/j*100:0;return{productId:a.product_id,name:a.name,revenue:Number(a.revenue),sharePct:j?Number(a.revenue)/j*100:0,cumulativePct:b,group:b<=80?"A":b<=95?"B":"C"}})}}async function m(a,f,g=(0,e.W)()){(0,d.assertCan)(f,"analytics");let i=(0,e.w)(g),j=await (0,c.q)(a,b.sql`
    select u.id, u.name, u.color, u.weekly_plan::float8 plan,
      coalesce((select round(sum(l.revenue)) from ${h(i.start,i.end)} l where l.manager_id = u.id), 0)::float8 revenue,
      (select count(*)::int from orders o where o.manager_id = u.id and o.deleted_at is null and (o.created_at at time zone 'Asia/Almaty')::date between ${i.start} and ${i.end}) orders
    from users u where u.is_sales_manager and u.active and u.deleted_at is null order by u.name`);return{...i,rows:j.map(a=>({...a,plan:Number(a.plan),revenue:Number(a.revenue),pct:Number(a.plan)?Number(a.revenue)/Number(a.plan)*100:0}))}}async function n(a,e,f,g){(0,d.assertCan)(e,"analytics");let h=await i(a,e,f,g,"day"),[j]=await (0,c.q)(a,b.sql`select count(*)::int orders, coalesce(sum(total),0)::float8 sum from orders
    where deleted_at is null and (created_at at time zone 'Asia/Almaty')::date between ${f} and ${g}`),k=await (0,c.q)(a,b.sql`select st.name, st.kind, st.sort, count(l.id)::int c from lead_stages st
    left join leads l on l.stage_id = st.id and l.deleted_at is null and (l.created_at at time zone 'Asia/Almaty')::date between ${f} and ${g}
    group by st.id order by st.sort`),l=k.reduce((a,b)=>a+b.c,0),m=k.filter(a=>"won"===a.kind||/заявк/i.test(a.name)).reduce((a,b)=>a+b.c,0);return{revenue:h.revenue,profit:h.profit,marginPct:h.marginPct,series:h.series,orders:j?.orders??0,ordersSum:Number(j?.sum??0),avgCheck:j?.orders?100*Math.round(Number(j.sum)/j.orders/100):0,funnel:k,conversionPct:l?m/l*100:0}}async function o(a,e,f,h){(0,d.assertCan)(e,"analytics");let i=await (0,g.R)(a,f,h);return(await (0,c.q)(a,b.sql`select id, name, color from users where active and deleted_at is null order by name`)).map(a=>{let b=i.find(b=>b.user_id===a.id);return{...a,open:b?.open??0,overdue:b?.overdue??0,done:b?.done??0,onTimePct:b?.with_due?b.on_time/b.with_due*100:null,avgHours:Number(b?.avg_hours??0)}})}let p=()=>b.sql`(select distinct on (ri.product_id) ri.product_id, ri.price
  from receipt_items ri join receipts r on r.id = ri.receipt_id
  where r.posted and r.deleted_at is null and ri.price > 0
  order by ri.product_id, r.date desc, r.id desc)`;async function q(a,g,h){(0,d.assertCan)(g,"stock");let i=(0,d.flag)(g,"seePurchase"),j=Math.max(1,h.page??1),k=[b.sql`p.deleted_at is null`];if(h.folderIds?.length&&k.push(b.sql`p.folder_id in (${b.sql.join(h.folderIds.map(a=>b.sql`${a}`),b.sql`, `)})`),h.q)for(let a of h.q.toLowerCase().split(/\s+/).filter(Boolean))k.push(b.sql`p.search_text like ${"%"+a+"%"}`);"negative"===h.tab&&k.push(b.sql`coalesce(s.qty,0) < 0`),"low"===h.tab&&k.push(b.sql`coalesce(s.qty,0) < p.min_stock and p.min_stock > 0`),"instock"===h.tab&&k.push(b.sql`coalesce(s.qty,0) > 0`);let l=b.sql.join(k,b.sql` and `),m=await (0,c.q)(a,b.sql`
    select p.id, p.name, p.sku, p.unit, f.name folder, coalesce(s.qty,0)::float8 qty, p.min_stock::float8, coalesce(lp.price, cp.value, 0)::float8 cost, inc.qty incoming, inc.eta::text eta
    from products p left join folders f on f.id = p.folder_id
      left join ${(0,f.stockSql)(void 0,h.warehouseId)} s on s.product_id = p.id
      left join (select ri.product_id, sum(ri.qty)::float8 qty, min(r.date) eta from receipt_items ri join receipts r on r.id = ri.receipt_id
        where r.posted and r.deleted_at is null and not ri.excluded and r.date > ${(0,e.W)()} group by ri.product_id) inc on inc.product_id = p.id
      left join ${p()} lp on lp.product_id = p.id
      left join (select distinct on (pp.product_id) pp.product_id, pp.value from product_prices pp join price_types pt on pt.id = pp.price_type_id where pt.is_purchase) cp on cp.product_id = p.id
    where ${l} order by ${"negative"===h.tab?b.sql`qty asc`:b.sql`p.name`} limit ${50} offset ${(j-1)*50}`),[n]=await (0,c.q)(a,b.sql`select count(*)::int c, coalesce(sum(greatest(coalesce(s.qty,0),0) * coalesce(lp.price,0)),0)::float8 value
    from products p left join ${(0,f.stockSql)(void 0,h.warehouseId)} s on s.product_id = p.id
    left join ${p()} lp on lp.product_id = p.id
    where ${l}`);return{rows:m.map(a=>({...a,qty:Number(a.qty),min_stock:Number(a.min_stock),cost:i?Number(a.cost):null,incoming:null==a.incoming?null:Number(a.incoming)})),total:n?.c??0,value:i?Number(n?.value??0):null,page:j,pageSize:50}}async function r(a,f,g=(0,e.W)()){return(0,d.assertCan)(f,"stock"),(0,c.q)(a,b.sql`
    select p.id product_id, p.name, p.unit, r.qty::float8 received, s.qty::float8 sold from products p
    join (select ri.product_id, sum(ri.qty) qty from receipt_items ri join receipts r on r.id = ri.receipt_id where r.posted and r.deleted_at is null and not ri.excluded and r.date = ${g} group by 1) r on r.product_id = p.id
    join (select si.product_id, sum(si.qty) qty from shipment_items si join shipments s on s.id = si.shipment_id where s.posted and s.deleted_at is null and s.kind='shipment' and s.date = ${g} group by 1) s on s.product_id = p.id
    order by p.name`)}a.s(["S",0,l,"f",0,j,"s",0,()=>({from:(0,e.b)((0,e.W)(),-29),to:(0,e.W)()}),"b",0,n,"w",0,m,"i",0,k,"m",0,r,"Q",0,q,"l",0,o])}];

//# sourceMappingURL=src_modules_analytics_service_ts_06ww9w-1pmaj_._.js.map