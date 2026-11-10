import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, orderItems, orderStatuses, orderStatusHistory, orders, priceTypes, productPrices, products, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, can, flag, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { addDays, money, today } from "@/lib/format";
import { stockSql } from "@/modules/stock/queries";
import { catalog } from "@/modules/products/service";
import { matchProduct, parseList } from "./parse";
import * as acc from "@/modules/payroll/accruals";
import { notify } from "@/modules/notifications/service";
import { emitWebhook } from "@/modules/webhooks/service";

export const orderItemInput = z.object({ productId: z.number().int(), qty: z.number().positive("Количество > 0"), price: z.number().int().min(0).optional() });
export const orderInput = z.object({
  counterpartyId: z.number().int({ error: "Выберите клиента" }),
  managerId: z.number().int().nullable().optional(),
  /** Второй сотрудник: начисления по заявке делятся пополам */
  coUserId: z.number().int().nullable().optional(),
  priceTypeId: z.number().int().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  discountPct: z.number().min(0).max(100).default(0),
  comment: z.string().max(5000).default(""),
  source: z.enum(["manual", "text", "voice", "copy", "lead", "api"]).default("manual"),
  leadId: z.number().int().nullable().optional(),
  items: z.array(orderItemInput).default([]),
});
export type OrderInput = z.infer<typeof orderInput>;

export async function statuses(db: DB) {
  return db.select().from(orderStatuses).orderBy(asc(orderStatuses.sort));
}
async function statusByCode(db: DB, code: string) {
  const [s] = await db.select().from(orderStatuses).where(eq(orderStatuses.code, code));
  return s ?? null;
}

/** Тип цены по сегменту клиента */
export async function defaultPriceType(db: DB, cpId: number) {
  const [cp] = await db.select({ segment: counterparties.segment }).from(counterparties).where(eq(counterparties.id, cpId));
  const code = cp?.segment === "bazaar" ? "bazaar" : cp?.segment === "shop" ? "shop" : "cash";
  const [t] = await db.select().from(priceTypes).where(eq(priceTypes.code, code));
  return t?.id ?? null;
}

export function orderTotal(items: { qty: number; price: number }[], discountPct: number) {
  const sum = items.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  return Math.round(sum * (1 - discountPct / 100));
}

async function fillPrices(db: DB, items: z.infer<typeof orderItemInput>[], priceTypeId: number | null) {
  const need = items.filter((i) => i.price === undefined).map((i) => i.productId);
  const map = new Map<number, number>();
  if (need.length && priceTypeId) {
    const rows = await db.select().from(productPrices).where(and(inArray(productPrices.productId, need), eq(productPrices.priceTypeId, priceTypeId)));
    for (const r of rows) map.set(r.productId, r.value);
  }
  return items.map((i, idx) => ({ productId: i.productId, qty: i.qty, price: i.price ?? map.get(i.productId) ?? 0, sort: idx }));
}

export type OrderListParams = {
  q?: string; statusId?: number; managerId?: number; counterpartyId?: number; from?: string; to?: string;
  page?: number; pageSize?: number; assembly?: "todo" | "assembled"; deliveredNoShipment?: boolean;
};

export async function listOrders(db: DB, p: Principal, params: OrderListParams = {}) {
  assertCan(p, "orders");
  const page = Math.max(1, params.page ?? 1), size = Math.min(200, params.pageSize ?? 30);
  const conds: (SQL | undefined)[] = [isNull(orders.deletedAt)];
  if (params.statusId) conds.push(eq(orders.statusId, params.statusId));
  if (params.managerId) conds.push(eq(orders.managerId, params.managerId));
  if (params.counterpartyId) conds.push(eq(orders.counterpartyId, params.counterpartyId));
  if (params.from) conds.push(gte(sql`(${orders.createdAt} at time zone 'Asia/Almaty')::date`, params.from));
  if (params.to) conds.push(lte(sql`(${orders.createdAt} at time zone 'Asia/Almaty')::date`, params.to));
  if (params.q) {
    const n = Number(params.q.replace(/\D/g, ""));
    conds.push(sql`(lower(${counterparties.name}) like ${"%" + params.q.toLowerCase() + "%"} or ${orders.number} = ${n || -1} or lower(${orders.comment}) like ${"%" + params.q.toLowerCase() + "%"})`);
  }
  if (params.assembly === "todo") conds.push(sql`${orders.assemblyStatus} <> 'assembled' and ${orderStatuses.isFinal} = false and ${orderStatuses.isCancelled} = false and ${orderStatuses.code} <> 'new'`);
  if (params.assembly === "assembled") conds.push(eq(orders.assemblyStatus, "assembled"));
  if (params.deliveredNoShipment) conds.push(sql`${orderStatuses.code} in ('delivered','paid') and not exists (select 1 from shipments s where s.order_id = ${orders.id} and s.kind='shipment' and s.posted and s.deleted_at is null)`);
  const where = and(...conds);
  const rows = await db.select({
    id: orders.id, number: orders.number, total: orders.total, createdAt: orders.createdAt, deliveryDate: orders.deliveryDate,
    statusId: orders.statusId, statusName: orderStatuses.name, statusColor: orderStatuses.color, statusCode: orderStatuses.code,
    counterpartyId: orders.counterpartyId, counterpartyName: counterparties.name, segment: counterparties.segment,
    managerName: users.name, managerId: orders.managerId, assemblyStatus: orders.assemblyStatus, source: orders.source, discountPct: orders.discountPct,
    itemsCount: sql<number>`(select count(*)::int from order_items oi where oi.order_id = ${orders.id})`,
    shipped: sql<boolean>`exists (select 1 from shipments s where s.order_id = ${orders.id} and s.kind='shipment' and s.posted and s.deleted_at is null)`,
    paidSum: sql<number>`coalesce((select sum(amount) from payments pm where pm.order_id = ${orders.id} and pm.direction='in' and pm.deleted_at is null),0)::float8`,
  }).from(orders)
    .innerJoin(counterparties, eq(counterparties.id, orders.counterpartyId))
    .innerJoin(orderStatuses, eq(orderStatuses.id, orders.statusId))
    .leftJoin(users, eq(users.id, orders.managerId))
    .where(where).orderBy(desc(orders.createdAt)).limit(size).offset((page - 1) * size);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(orders)
    .innerJoin(counterparties, eq(counterparties.id, orders.counterpartyId))
    .innerJoin(orderStatuses, eq(orderStatuses.id, orders.statusId)).where(where);
  return { rows: rows.map((r) => ({ ...r, paidSum: Number(r.paidSum) })), total: c, page, pageSize: size };
}

export async function getOrder(db: DB, p: Principal, id: number) {
  assertCan(p, "orders");
  const [o] = await db.select({ o: orders, cp: counterparties, st: orderStatuses }).from(orders)
    .innerJoin(counterparties, eq(counterparties.id, orders.counterpartyId))
    .innerJoin(orderStatuses, eq(orderStatuses.id, orders.statusId))
    .where(and(eq(orders.id, id), isNull(orders.deletedAt)));
  if (!o) throw new NotFoundError("Заявка не найдена");
  const st = stockSql();
  const items = await db.select({
    id: orderItems.id, productId: orderItems.productId, qty: orderItems.qty, price: orderItems.price, assembled: orderItems.assembled,
    name: products.name, sku: products.sku, unit: products.unit, stock: sql<number>`coalesce(st.qty,0)`,
  }).from(orderItems).innerJoin(products, eq(products.id, orderItems.productId))
    .leftJoin(sql`${st} st`, sql`st.product_id = ${orderItems.productId}`)
    .where(eq(orderItems.orderId, id)).orderBy(asc(orderItems.sort), asc(orderItems.id));
  const history = await db.select({ id: orderStatusHistory.id, createdAt: orderStatusHistory.createdAt, statusName: orderStatuses.name, color: orderStatuses.color, userName: users.name, comment: orderStatusHistory.comment })
    .from(orderStatusHistory).innerJoin(orderStatuses, eq(orderStatuses.id, orderStatusHistory.statusId)).leftJoin(users, eq(users.id, orderStatusHistory.userId))
    .where(eq(orderStatusHistory.orderId, id)).orderBy(desc(orderStatusHistory.createdAt));
  const shipments = await q<{ id: number; number: number; kind: string; date: string; total: number; posted: boolean }>(db, sql`
    select id, number, kind, date::text, total::float8, posted from shipments where order_id = ${id} and deleted_at is null order by date, id`);
  const pays = await q<{ id: number; number: number; date: string; amount: number; method: string }>(db, sql`
    select id, number, date::text, amount::float8, method from payments where order_id = ${id} and direction='in' and deleted_at is null order by date, id`);
  const shippedQty = await shippedByProduct(db, id);
  const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, o.o.authorId));
  const [manager] = o.o.managerId ? await db.select({ name: users.name }).from(users).where(eq(users.id, o.o.managerId)) : [];
  const [coUser] = o.o.coUserId ? await db.select({ name: users.name }).from(users).where(eq(users.id, o.o.coUserId)) : [];
  let accruals: Awaited<ReturnType<typeof acc.accrualsForOrder>> = [];
  if (flag(p, "seeSalaries")) accruals = await acc.accrualsForOrder(db, id);
  return {
    ...o.o, counterparty: o.cp, status: o.st, authorName: author?.name ?? "", managerName: manager?.name ?? null, coUserName: coUser?.name ?? null,
    items: items.map((i) => ({ ...i, stock: Number(i.stock), shipped: shippedQty.get(i.productId) ?? 0 })),
    history, shipments: shipments.map((s) => ({ ...s, total: Number(s.total) })), payments: pays.map((x) => ({ ...x, amount: Number(x.amount) })),
    paidSum: pays.reduce((s, x) => s + Number(x.amount), 0), accruals,
  };
}

/** Отгружено по заявке (за вычетом возвратов): productId → qty */
export async function shippedByProduct(db: DB, orderId: number) {
  const rows = await q<{ product_id: number; qty: number }>(db, sql`select si.product_id, sum(case when s.kind='shipment' then si.qty else -si.qty end)::float8 qty
    from shipment_items si join shipments s on s.id = si.shipment_id where s.order_id = ${orderId} and s.posted and s.deleted_at is null group by si.product_id`);
  return new Map(rows.map((r) => [r.product_id, Number(r.qty)]));
}

export async function createOrder(db: DB, p: Principal, input: OrderInput, extra: { copiedFromId?: number } = {}) {
  assertCan(p, "orders", "full");
  const [cp] = await db.select().from(counterparties).where(and(eq(counterparties.id, input.counterpartyId), isNull(counterparties.deletedAt)));
  if (!cp) throw new ValidationError("Клиент не найден");
  const st = await statusByCode(db, "new") ?? (await statuses(db))[0];
  const priceTypeId = input.priceTypeId ?? (await defaultPriceType(db, input.counterpartyId));
  const id = await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const items = await fillPrices(tx, input.items, priceTypeId);
    const number = await nextNumber(tx, "order");
    const [o] = await tx.insert(orders).values({
      number, counterpartyId: input.counterpartyId, managerId: input.managerId ?? cp.managerId ?? (p.isSalesManager ? p.id : null), authorId: p.id,
      coUserId: input.coUserId ?? null, statusId: st.id, priceTypeId, deliveryDate: input.deliveryDate || null, discountPct: input.discountPct, comment: input.comment,
      source: input.source, leadId: input.leadId ?? null, copiedFromId: extra.copiedFromId ?? null, total: orderTotal(items, input.discountPct),
    }).returning();
    if (items.length) await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: o.id })));
    await tx.insert(orderStatusHistory).values({ orderId: o.id, statusId: st.id, userId: p.id, comment: "Создана" });
    await audit(tx, p, "create", "order", o.id, `Создана заявка №${number} (${cp.name}) на ${money(o.total)}`);
    await acc.onOrderCreated(tx, o.id);
    return o.id;
  });
  const res = await getOrder(db, p, id);
  emitWebhook(db, "order.created", { id, number: res.number, counterpartyId: res.counterpartyId, total: res.total });
  return res;
}

export async function updateOrder(db: DB, p: Principal, id: number, input: OrderInput) {
  assertCan(p, "orders", "full");
  const [before] = await db.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt)));
  if (!before) throw new NotFoundError();
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const priceTypeId = input.priceTypeId ?? before.priceTypeId;
    const items = await fillPrices(tx, input.items, priceTypeId);
    const total = orderTotal(items, input.discountPct);
    const prevItems = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    await tx.delete(orderItems).where(eq(orderItems.orderId, id));
    if (items.length) await tx.insert(orderItems).values(items.map((i) => ({ ...i, orderId: id, assembled: prevItems.find((x) => x.productId === i.productId)?.assembled ?? false })));
    await tx.update(orders).set({
      counterpartyId: input.counterpartyId, managerId: input.managerId ?? before.managerId, priceTypeId, deliveryDate: input.deliveryDate || null,
      coUserId: input.coUserId === undefined ? before.coUserId : input.coUserId,
      discountPct: input.discountPct, comment: input.comment, total, updatedAt: new Date(),
    }).where(eq(orders.id, id));
    await audit(tx, p, "update", "order", id, `Изменена заявка №${before.number}${total !== before.total ? `: ${money(before.total)} → ${money(total)}` : ""}`);
    const coChanged = input.coUserId !== undefined && (input.coUserId ?? null) !== before.coUserId;
    if (coChanged) await acc.syncCoUser(tx, id);
    else if (total !== before.total) await acc.recalcOrder(tx, id);
  });
  return getOrder(db, p, id);
}

export async function addItems(db: DB, p: Principal, id: number, add: z.infer<typeof orderItemInput>[]) {
  const o = await getOrder(db, p, id);
  const merged = new Map<number, { productId: number; qty: number; price?: number }>();
  for (const i of o.items) merged.set(i.productId, { productId: i.productId, qty: i.qty, price: i.price });
  for (const i of add) {
    const ex = merged.get(i.productId);
    if (ex) ex.qty += i.qty; else merged.set(i.productId, { ...i });
  }
  return updateOrder(db, p, id, {
    counterpartyId: o.counterpartyId, managerId: o.managerId, coUserId: o.coUserId, priceTypeId: o.priceTypeId, deliveryDate: o.deliveryDate,
    discountPct: o.discountPct, comment: o.comment, source: "manual", items: [...merged.values()],
  });
}

export async function setStatus(db: DB, p: Principal, id: number, statusId: number, comment?: string) {
  assertCan(p, "orders", "full");
  const [o] = await db.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt)));
  if (!o) throw new NotFoundError();
  if (o.statusId === statusId) return;
  const [st] = await db.select().from(orderStatuses).where(eq(orderStatuses.id, statusId));
  if (!st) throw new ValidationError("Статус не найден");
  const [prev] = await db.select().from(orderStatuses).where(eq(orderStatuses.id, o.statusId));
  // «Доставлен» / «Оплачен» — сразу проводим отгрузку неотгруженного остатка (товар списывается со склада)
  if ((st.code === "delivered" || st.code === "paid") && can(p, "shipments", "full")) {
    const { autoShipOrder } = await import("@/modules/shipments/service");
    await autoShipOrder(db, p, id);
    // отгрузка могла сама перевести заявку в «Доставлен»
    const [now] = await db.select({ statusId: orders.statusId }).from(orders).where(eq(orders.id, id));
    if (now?.statusId === statusId) {
      emitWebhook(db, "order.status", { id, number: o.number, from: prev?.code ?? null, to: st.code, status: st.name });
      await notify(db, [o.managerId, o.authorId], { type: "order_status", title: `Заявка №${o.number}: ${st.name}`, body: comment ?? "", link: `/orders/${id}`, excludeUserId: p.id });
      return;
    }
  }
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    await tx.update(orders).set({ statusId, updatedAt: new Date() }).where(eq(orders.id, id));
    await tx.insert(orderStatusHistory).values({ orderId: id, statusId, userId: p.id, comment: comment ?? null });
    await audit(tx, p, "status", "order", id, `Заявка №${o.number}: ${prev?.name} → ${st.name}`);
    if (st.isCancelled) await acc.onOrderCancelled(tx, id);
    else if (prev?.isCancelled) await acc.onOrderRestored(tx, id);
    if (st.code === "paid") await acc.confirmFor(tx, id, "paid");
  });
  emitWebhook(db, "order.status", { id, number: o.number, from: prev?.code ?? null, to: st.code, status: st.name });
  await notify(db, [o.managerId, o.authorId], { type: "order_status", title: `Заявка №${o.number}: ${st.name}`, body: comment ?? "", link: `/orders/${id}`, excludeUserId: p.id });
}

export async function reschedule(db: DB, p: Principal, id: number, date: string | null) {
  assertCan(p, "orders", "full");
  const [o] = await db.update(orders).set({ deliveryDate: date, updatedAt: new Date() }).where(eq(orders.id, id)).returning();
  if (!o) throw new NotFoundError();
  await audit(db, p, "update", "order", id, `Заявка №${o.number}: перенос доставки на ${date ?? "—"}`);
}

/** Копия заявки, опционально со скидкой: процент или сумма (распределяется пропорционально) */
export async function copyOrder(db: DB, p: Principal, id: number, discount?: { kind: "percent" | "amount"; value: number }) {
  const o = await getOrder(db, p, id);
  let discountPct = o.discountPct;
  let items = o.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price }));
  if (discount?.kind === "percent") discountPct = discount.value;
  if (discount?.kind === "amount" && discount.value > 0) {
    const sum = items.reduce((s, i) => s + i.qty * i.price, 0);
    const k = sum > 0 ? Math.max(0, 1 - discount.value / sum) : 1;
    items = items.map((i) => ({ ...i, price: Math.round(i.price * k) }));
    discountPct = 0;
  }
  return createOrder(db, p, {
    counterpartyId: o.counterpartyId, managerId: o.managerId, coUserId: o.coUserId, priceTypeId: o.priceTypeId, deliveryDate: null, discountPct,
    comment: `Копия заявки №${o.number}${o.comment ? ". " + o.comment : ""}`, source: "copy", items,
  }, { copiedFromId: id });
}

export async function deleteOrder(db: DB, p: Principal, id: number) {
  assertCan(p, "orders", "full");
  const [o] = await db.select().from(orders).where(and(eq(orders.id, id), isNull(orders.deletedAt)));
  if (!o) throw new NotFoundError();
  const [{ c }] = await q<{ c: number }>(db, sql`select count(*)::int c from shipments where order_id = ${id} and posted and deleted_at is null`);
  if (c > 0 && !flag(p, "deleteDocs")) throw new ValidationError("По заявке есть проведённые отгрузки — удаление требует права «Удалять документы»");
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    await tx.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, id));
    await acc.onOrderCancelled(tx, id);
    await audit(tx, p, "delete", "order", id, `Удалена заявка №${o.number}`);
  });
}

/** Массовое удаление старых черновиков (без отгрузок и оплат) */
export async function bulkDeleteDrafts(db: DB, p: Principal, olderThanDays: number, statusIds: number[], dryRun: boolean) {
  assertCan(p, "orders", "full");
  if (!statusIds.length) throw new ValidationError("Выберите статусы");
  const cutoff = addDays(today(), -olderThanDays);
  const rows = await q<{ id: number; number: number }>(db, sql`select o.id, o.number from orders o
    where o.deleted_at is null and o.status_id in (${sql.join(statusIds.map((s) => sql`${s}`), sql`, `)})
      and (o.created_at at time zone 'Asia/Almaty')::date < ${cutoff}
      and not exists (select 1 from shipments s where s.order_id = o.id and s.deleted_at is null)
      and not exists (select 1 from payments pm where pm.order_id = o.id and pm.deleted_at is null)`);
  if (dryRun) return { count: rows.length, numbers: rows.map((r) => r.number) };
  for (const r of rows) {
    await db.update(orders).set({ deletedAt: new Date() }).where(eq(orders.id, r.id));
    await acc.onOrderCancelled(db, r.id);
  }
  await audit(db, p, "delete", "order", rows.map((r) => r.id).join(","), `Массовое удаление черновиков: ${rows.length} шт. (старше ${olderThanDays} дн.)`);
  return { count: rows.length, numbers: rows.map((r) => r.number) };
}

/* ───── Сборка ───── */

export async function setItemAssembled(db: DB, p: Principal, itemId: number, assembled: boolean) {
  assertCan(p, "orders");
  if (!p.isAssembler && !p.isOwner && !(p.permissions.modules.orders === "full")) throw new ValidationError("Отмечать сборку может сборщик");
  const [it] = await db.update(orderItems).set({ assembled }).where(eq(orderItems.id, itemId)).returning();
  if (!it) throw new NotFoundError();
  await db.update(orders).set({ assemblyStatus: "assembling", updatedAt: new Date() }).where(and(eq(orders.id, it.orderId), eq(orders.assemblyStatus, "none")));
  return it;
}

export async function finishAssembly(db: DB, p: Principal, orderId: number, photos: { id: number; name: string; mime: string; size: number }[] = []) {
  assertCan(p, "orders");
  if (!p.isAssembler && !p.isOwner && !(p.permissions.modules.orders === "full")) throw new ValidationError("Завершать сборку может сборщик");
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new NotFoundError();
  await db.update(orderItems).set({ assembled: true }).where(eq(orderItems.orderId, orderId));
  await db.update(orders).set({ assemblyStatus: "assembled", assembledById: p.id, assembledAt: new Date(), assemblyPhotos: [...o.assemblyPhotos, ...photos], updatedAt: new Date() }).where(eq(orders.id, orderId));
  await audit(db, p, "update", "order", orderId, `Заявка №${o.number} собрана`);
  await notify(db, [o.managerId], { type: "order_status", title: `Заявка №${o.number} собрана`, body: `Собрал: ${p.name}`, link: `/orders/${orderId}`, excludeUserId: p.id });
}

/* ───── Разбор текста ───── */

export async function parseAndMatch(db: DB, p: Principal, text: string, priceTypeId?: number | null) {
  assertCan(p, "orders");
  const lines = parseList(text);
  const cat = await catalog(db);
  const st = stockSql();
  const res = lines.map((l) => ({ line: l, match: matchProduct(l.name, cat) }));
  const ids = [...new Set(res.flatMap((r) => r.match.candidates.map((c) => c.id)))];
  const extra = ids.length ? await db.select({ id: products.id, stock: sql<number>`coalesce(st.qty,0)`, price: sql<number>`coalesce(pp.value,0)` })
    .from(products).leftJoin(sql`${st} st`, sql`st.product_id = ${products.id}`)
    .leftJoin(sql`product_prices pp`, sql`pp.product_id = ${products.id} and pp.price_type_id = ${priceTypeId ?? -1}`)
    .where(inArray(products.id, ids)) : [];
  const em = new Map(extra.map((e) => [e.id, e]));
  return res.map((r) => ({
    raw: r.line.raw, name: r.line.name, qty: r.line.qty, unit: r.line.unit, price: r.line.price,
    status: r.match.status,
    productId: r.match.best?.id ?? null,
    candidates: r.match.candidates.map((c) => ({ id: c.id, name: c.name, sku: c.sku, unit: c.unit, score: Math.round(c.score * 100), stock: Number(em.get(c.id)?.stock ?? 0), price: Number(em.get(c.id)?.price ?? 0) })),
  }));
}
