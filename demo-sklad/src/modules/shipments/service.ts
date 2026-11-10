import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, orders, orderStatuses, priceTypes, productPrices, products, shipmentItems, shipments, users, warehouses } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, flag, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { money, today } from "@/lib/format";
import { lastPurchaseSql, stockSql } from "@/modules/stock/queries";
import { checkDebtLimit } from "@/modules/counterparties/service";
import { shippedByProduct } from "@/modules/orders/service";
import * as acc from "@/modules/payroll/accruals";
import { notify } from "@/modules/notifications/service";
import { emitWebhook } from "@/modules/webhooks/service";

export const shipmentInput = z.object({
  kind: z.enum(["shipment", "return"]).default("shipment"),
  orderId: z.number().int().nullable().optional(),
  counterpartyId: z.number().int(),
  warehouseId: z.number().int().optional(),
  date: z.string().default(() => today()),
  comment: z.string().max(2000).default(""),
  items: z.array(z.object({ productId: z.number().int(), qty: z.number().positive(), price: z.number().int().min(0) })).min(1, "Добавьте позиции"),
  /** Провести несмотря на превышение лимита долга (только с полным доступом к контрагентам) */
  overrideDebtLimit: z.boolean().default(false),
});
export type ShipmentInput = z.infer<typeof shipmentInput>;

export async function defaultWarehouse(db: DB) {
  const [w] = await db.select().from(warehouses).where(eq(warehouses.active, true)).limit(1);
  if (!w) throw new ValidationError("Нет склада");
  return w.id;
}

/**
 * Себестоимость единицы на дату: последняя закупка по приёмке, иначе закупочная цена из карточки (расчётная).
 */
export async function unitCosts(db: DB, productIds: number[], date: string) {
  const res = new Map<number, { cost: number; estimated: boolean }>();
  if (!productIds.length) return res;
  const lp = await q<{ product_id: number; price: number }>(db, sql`select product_id, price::float8 from ${lastPurchaseSql(date)} lp
    where lp.product_id in (${sql.join(productIds.map((i) => sql`${i}`), sql`, `)})`);
  for (const r of lp) res.set(r.product_id, { cost: Number(r.price), estimated: false });
  const missing = productIds.filter((i) => !res.has(i));
  if (missing.length) {
    const card = await db.select({ productId: productPrices.productId, value: productPrices.value }).from(productPrices)
      .innerJoin(priceTypes, eq(priceTypes.id, productPrices.priceTypeId))
      .where(and(eq(priceTypes.isPurchase, true), inArray(productPrices.productId, missing)));
    for (const c of card) res.set(c.productId, { cost: c.value, estimated: true });
    for (const m of missing) if (!res.has(m)) res.set(m, { cost: 0, estimated: true });
  }
  return res;
}

export async function createShipment(db: DB, p: Principal, input: ShipmentInput) {
  assertCan(p, "shipments", "full");
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, input.counterpartyId));
  if (!cp) throw new ValidationError("Контрагент не найден");
  let order: typeof orders.$inferSelect | undefined;
  if (input.orderId) {
    [order] = await db.select().from(orders).where(and(eq(orders.id, input.orderId), isNull(orders.deletedAt)));
    if (!order) throw new ValidationError("Заявка не найдена");
  }
  const total = input.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  if (input.kind === "shipment") {
    const lim = await checkDebtLimit(db, cp.id, total);
    if (lim.exceeded) {
      await notify(db, [lim.managerId], { type: "debt_limit", title: `Превышен лимит долга: ${cp.name}`, body: `Долг после отгрузки ${money(lim.after)} при лимите ${money(lim.limit)}`, link: `/counterparties/${cp.id}` });
      if (lim.mode === "block" && !(input.overrideDebtLimit && (p.isOwner || flag(p, "deleteDocs")))) {
        throw new ValidationError(`Отгрузка заблокирована: долг клиента после отгрузки ${money(lim.after)} превысит лимит ${money(lim.limit)}`);
      }
    }
  }
  if (input.kind === "return" && order) {
    const shipped = await shippedByProduct(db, order.id);
    for (const i of input.items) if (i.qty > (shipped.get(i.productId) ?? 0) + 1e-9) throw new ValidationError("Возврат больше отгруженного количества");
  }
  const warehouseId = input.warehouseId ?? (await defaultWarehouse(db));
  const costs = await unitCosts(db, input.items.map((i) => i.productId), input.date);
  const id = await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const number = await nextNumber(tx, input.kind);
    const cost = input.items.reduce((s, i) => s + Math.round(i.qty * (costs.get(i.productId)?.cost ?? 0)), 0);
    const [sh] = await tx.insert(shipments).values({
      number, kind: input.kind, orderId: input.orderId ?? null, counterpartyId: cp.id, warehouseId, date: input.date, posted: true,
      total, cost, comment: input.comment, authorId: p.id,
    }).returning();
    await tx.insert(shipmentItems).values(input.items.map((i) => ({
      shipmentId: sh.id, productId: i.productId, qty: i.qty, price: i.price,
      cost: costs.get(i.productId)?.cost ?? 0, costEstimated: costs.get(i.productId)?.estimated ?? true,
    })));
    await audit(tx, p, "create", "shipment", sh.id, `${input.kind === "return" ? "Возврат" : "Отгрузка"} №${number} (${cp.name}) на ${money(total)}`);
    if (order) {
      if (input.kind === "shipment") await acc.confirmFor(tx, order.id, "shipment");
      else await acc.onReturn(tx, order.id, sh.id, total, input.date);
      // статус «Доставлен» при полной отгрузке
      if (input.kind === "shipment") {
        const [awaiting] = await tx.select().from(orderStatuses).where(eq(orderStatuses.id, order.statusId));
        const [delivered] = await tx.select().from(orderStatuses).where(eq(orderStatuses.code, "delivered"));
        if (delivered && awaiting && !awaiting.isFinal && !awaiting.isCancelled && awaiting.code !== "delivered" && awaiting.code !== "paid") {
          const shipped = await shippedByProduct(tx, order.id);
          const its = await q<{ product_id: number; qty: number }>(tx, sql`select product_id, qty::float8 from order_items where order_id = ${order.id}`);
          if (its.every((i) => (shipped.get(i.product_id) ?? 0) + 1e-9 >= Number(i.qty))) {
            await tx.update(orders).set({ statusId: delivered.id, updatedAt: new Date() }).where(eq(orders.id, order.id));
            await tx.execute(sql`insert into order_status_history (order_id, status_id, user_id, comment) values (${order.id}, ${delivered.id}, ${p.id}, ${"Автоматически: отгружено полностью"})`);
          }
        }
      }
    }
    return sh.id;
  });
  await checkNegativeStock(db, input.items.map((i) => i.productId));
  const res = await getShipment(db, p, id);
  emitWebhook(db, "shipment.posted", { id, kind: input.kind, number: res.number, counterpartyId: res.counterpartyId, orderId: res.orderId, total: res.total });
  return res;
}

/** Уведомление об отрицательных остатках */
export async function checkNegativeStock(db: DB, productIds: number[]) {
  if (!productIds.length) return;
  const neg = await q<{ product_id: number; qty: number; name: string }>(db, sql`select s.product_id, s.qty, p.name from ${stockSql()} s join products p on p.id = s.product_id
    where s.qty < 0 and s.product_id in (${sql.join(productIds.map((i) => sql`${i}`), sql`, `)})`);
  if (!neg.length) return;
  emitWebhook(db, "stock.negative", neg.map((n) => ({ productId: n.product_id, name: n.name, qty: Number(n.qty) })));
  const recipients = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), sql`(${users.isOwner} or ${users.permissions}->'modules'->>'receipts' = 'full')`));
  await notify(db, recipients.map((r) => r.id), {
    type: "negative_stock", title: `Отрицательный остаток: ${neg.length} поз.`,
    body: neg.slice(0, 3).map((n) => `${n.name}: ${n.qty}`).join("; "), link: "/stock?tab=negative",
  });
}

export async function getShipment(db: DB, p: Principal, id: number) {
  assertCan(p, "shipments");
  const [sh] = await db.select({ s: shipments, cp: counterparties }).from(shipments).innerJoin(counterparties, eq(counterparties.id, shipments.counterpartyId))
    .where(and(eq(shipments.id, id), isNull(shipments.deletedAt)));
  if (!sh) throw new NotFoundError("Документ не найден");
  const items = await db.select({ id: shipmentItems.id, productId: shipmentItems.productId, qty: shipmentItems.qty, price: shipmentItems.price, cost: shipmentItems.cost,
    costEstimated: shipmentItems.costEstimated, name: products.name, unit: products.unit, sku: products.sku })
    .from(shipmentItems).innerJoin(products, eq(products.id, shipmentItems.productId)).where(eq(shipmentItems.shipmentId, id));
  const [order] = sh.s.orderId ? await db.select({ id: orders.id, number: orders.number, statusName: orderStatuses.name, statusColor: orderStatuses.color })
    .from(orders).innerJoin(orderStatuses, eq(orderStatuses.id, orders.statusId)).where(eq(orders.id, sh.s.orderId)) : [];
  const pays = await q<{ id: number; number: number; amount: number; date: string }>(db, sql`select id, number, amount::float8, date::text from payments
    where deleted_at is null and direction='in' and (shipment_id = ${id} ${sh.s.orderId ? sql`or order_id = ${sh.s.orderId}` : sql``})`);
  const showProfit = flag(p, "seeProfit");
  return {
    ...sh.s, cost: showProfit ? sh.s.cost : null, margin: showProfit ? sh.s.total - sh.s.cost : null,
    counterparty: sh.cp, order: order ?? null, payments: pays.map((x) => ({ ...x, amount: Number(x.amount) })),
    items: items.map((i) => ({ ...i, cost: showProfit ? i.cost : null, costEstimated: showProfit ? i.costEstimated : null })),
  };
}

export async function listShipments(db: DB, p: Principal, params: { kind?: string; q?: string; counterpartyId?: number; from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  assertCan(p, "shipments");
  const page = Math.max(1, params.page ?? 1), size = Math.min(200, params.pageSize ?? 30);
  const conds: (SQL | undefined)[] = [isNull(shipments.deletedAt)];
  if (params.kind) conds.push(eq(shipments.kind, params.kind));
  if (params.counterpartyId) conds.push(eq(shipments.counterpartyId, params.counterpartyId));
  if (params.from) conds.push(sql`${shipments.date} >= ${params.from}`);
  if (params.to) conds.push(sql`${shipments.date} <= ${params.to}`);
  if (params.q) conds.push(sql`(lower(${counterparties.name}) like ${"%" + params.q.toLowerCase() + "%"} or ${shipments.number} = ${Number(params.q.replace(/\D/g, "")) || -1})`);
  const where = and(...conds);
  const showProfit = flag(p, "seeProfit");
  const rows = await db.select({
    id: shipments.id, number: shipments.number, kind: shipments.kind, date: shipments.date, total: shipments.total, cost: shipments.cost,
    counterpartyName: counterparties.name, counterpartyId: shipments.counterpartyId, orderId: shipments.orderId, orderNumber: orders.number, posted: shipments.posted,
  }).from(shipments).innerJoin(counterparties, eq(counterparties.id, shipments.counterpartyId)).leftJoin(orders, eq(orders.id, shipments.orderId))
    .where(where).orderBy(desc(shipments.date), desc(shipments.id)).limit(size).offset((page - 1) * size);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(shipments).innerJoin(counterparties, eq(counterparties.id, shipments.counterpartyId)).where(where);
  return { rows: rows.map((r) => ({ ...r, cost: showProfit ? r.cost : null, margin: showProfit ? r.total - r.cost : null })), total: c, page, pageSize: size };
}

export async function deleteShipment(db: DB, p: Principal, id: number) {
  assertCan(p, "shipments", "full");
  if (!flag(p, "deleteDocs")) throw new ValidationError("Удаление проведённых документов требует права «Удалять документы»");
  const [sh] = await db.select().from(shipments).where(and(eq(shipments.id, id), isNull(shipments.deletedAt)));
  if (!sh) throw new NotFoundError();
  await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    await tx.update(shipments).set({ deletedAt: new Date() }).where(eq(shipments.id, id));
    if (sh.orderId) {
      if (sh.kind === "return") await acc.onReturnDeleted(tx, sh.orderId, id);
      else await acc.recalcOrder(tx, sh.orderId);
    }
    await audit(tx, p, "delete", "shipment", id, `Удалён документ ${sh.kind === "return" ? "возврата" : "отгрузки"} №${sh.number}`);
  });
}

/** Черновик отгрузки по заявке: неотгруженный остаток позиций */
/** Отгрузка всего неотгруженного по заявке (при переводе в «Доставлен»). Ничего не делает, если отгружать нечего. */
export async function autoShipOrder(db: DB, p: Principal, orderId: number) {
  const d = await draftFromOrder(db, p, orderId);
  const items = d.items.filter((i) => i.qty > 1e-9).map((i) => ({ productId: i.productId, qty: i.qty, price: i.price }));
  if (!items.length) return null;
  return createShipment(db, p, shipmentInput.parse({ kind: "shipment", orderId, counterpartyId: d.counterpartyId, comment: "Автоматически при доставке заявки", items }));
}

export async function draftFromOrder(db: DB, p: Principal, orderId: number) {
  assertCan(p, "shipments");
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) throw new NotFoundError();
  const shipped = await shippedByProduct(db, orderId);
  const items = await db.select({ productId: shipmentItems.productId }).from(shipmentItems).limit(0);
  void items;
  const its = await q<{ product_id: number; qty: number; price: number; name: string; unit: string }>(db, sql`select oi.product_id, oi.qty::float8, oi.price::float8, p.name, p.unit
    from order_items oi join products p on p.id = oi.product_id where oi.order_id = ${orderId} order by oi.sort, oi.id`);
  const k = 1 - o.discountPct / 100;
  return {
    orderId, counterpartyId: o.counterpartyId,
    items: its.map((i) => ({ productId: i.product_id, name: i.name, unit: i.unit, ordered: Number(i.qty), shipped: shipped.get(i.product_id) ?? 0,
      qty: Math.max(0, Number(i.qty) - (shipped.get(i.product_id) ?? 0)), price: Math.round(Number(i.price) * k) })).filter((i) => i.qty > 0 || i.shipped > 0),
  };
}
