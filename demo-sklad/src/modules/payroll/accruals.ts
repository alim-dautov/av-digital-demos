/**
 * Начисления по правилам «автор заявки → получатель».
 * Срабатывают автоматически при создании/изменении/отмене заявки, отгрузке, оплате и возврате.
 */
import { and, eq, inArray, isNull, like, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { accrualRules, counterparties, orders, payrollAccruals, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { roundTenge, today } from "@/lib/format";

type Rule = typeof accrualRules.$inferSelect;
/** Основные строки начислений: получатель по правилу и второй сотрудник (половина ставки) */
const MAIN_KINDS = ["main", "main:co"];
type OrderRow = typeof orders.$inferSelect;

export function calcAccrual(base: number, rateBp: number) {
  return roundTenge((base * rateBp) / 10000);
}

/** Правила, подходящие под заявку */
export async function matchingRules(db: DB, order: Pick<OrderRow, "authorId" | "counterpartyId" | "createdAt">) {
  const [author] = await db.select({ id: users.id, isSalesManager: users.isSalesManager }).from(users).where(eq(users.id, order.authorId));
  const [cp] = await db.select({ segment: counterparties.segment }).from(counterparties).where(eq(counterparties.id, order.counterpartyId));
  const date = today(order.createdAt);
  const rules = await db.select().from(accrualRules).where(eq(accrualRules.active, true));
  return rules.filter((r) => {
    if (r.validFrom && r.validFrom > date) return false;
    if (r.segment && r.segment !== cp?.segment) return false;
    if (r.authorMatch === "user") return r.authorUserId === order.authorId;
    if (r.authorMatch === "sales_manager") return !!author?.isSalesManager;
    return true;
  });
}

function recipientOf(r: Rule, o: OrderRow) {
  if (r.recipientMode === "author") return o.authorId;
  if (r.recipientMode === "manager") return o.managerId;
  return r.recipientUserId;
}

/** База для правила по заявке */
async function baseFor(db: DB, r: Rule, o: OrderRow): Promise<number> {
  if (r.base === "order_total") return o.total;
  const [s] = await q<{ revenue: number; cost: number }>(db, sql`
    select coalesce(sum(case when s.kind='shipment' then si.qty*si.price else -si.qty*si.price end),0)::float8 as revenue,
           coalesce(sum(case when s.kind='shipment' then si.qty*si.cost else -si.qty*si.cost end),0)::float8 as cost
    from shipment_items si join shipments s on s.id = si.shipment_id
    where s.order_id = ${o.id} and s.posted and s.deleted_at is null`);
  const rev = Math.round(Number(s?.revenue ?? 0)), cost = Math.round(Number(s?.cost ?? 0));
  return r.base === "profit" ? rev - cost : rev;
}

/** При создании заявки (в т.ч. копии, голосом/текстом, через API) */
export async function onOrderCreated(db: DB, orderId: number) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return [];
  const rules = await matchingRules(db, o);
  if (!rules.length) {
    await audit(db, null, "accrual_skip", "order", o.id, `Заявка №${o.number}: правило начисления не найдено`, { authorId: o.authorId });
    return [];
  }
  const created = [];
  for (const r of rules) {
    const recipient = recipientOf(r, o);
    if (!recipient) continue;
    const base = await baseFor(db, r, o);
    const [row] = await db.insert(payrollAccruals).values({
      ruleId: r.id, orderId: o.id, kind: "main", recipientId: recipient, authorId: o.authorId, baseAmount: base, rateBp: r.rateBp,
      amount: calcAccrual(base, r.rateBp), status: "pending", accrualDate: today(o.createdAt),
    }).onConflictDoNothing().returning();
    if (row) created.push(row);
  }
  if (o.coUserId) await syncCoUser(db, o.id);
  return created;
}

/**
 * Заявку собирали двое: ставка каждого правила делится пополам между получателем и вторым сотрудником
 * (1% → 0,5% + 0,5%). Вызывается при создании заявки и при смене второго сотрудника.
 */
export async function syncCoUser(db: DB, orderId: number) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const rows = await db.select({ a: payrollAccruals, r: accrualRules }).from(payrollAccruals)
    .innerJoin(accrualRules, eq(accrualRules.id, payrollAccruals.ruleId))
    .where(and(eq(payrollAccruals.orderId, orderId), inArray(payrollAccruals.kind, MAIN_KINDS)));
  for (const { a: main, r } of rows.filter((x) => x.a.kind === "main")) {
    const co = rows.find((x) => x.a.kind === "main:co" && x.a.ruleId === main.ruleId)?.a;
    const split = !!o.coUserId && o.coUserId !== main.recipientId;
    const own = split ? Math.round(r.rateBp / 2) : r.rateBp;
    if (main.rateBp !== own) await db.update(payrollAccruals).set({ rateBp: own, updatedAt: new Date() }).where(eq(payrollAccruals.id, main.id));
    if (split) {
      const values = { recipientId: o.coUserId!, rateBp: r.rateBp - own, status: main.status, note: "второй сотрудник по заявке", updatedAt: new Date() };
      if (co) await db.update(payrollAccruals).set(values).where(eq(payrollAccruals.id, co.id));
      else await db.insert(payrollAccruals).values({
        ...values, ruleId: r.id, orderId, kind: "main:co", authorId: main.authorId, baseAmount: main.baseAmount, amount: 0, accrualDate: main.accrualDate,
      }).onConflictDoNothing();
    } else if (co && co.status !== "cancelled") {
      await db.update(payrollAccruals).set({ status: "cancelled", updatedAt: new Date(), note: "второй сотрудник снят" }).where(eq(payrollAccruals.id, co.id));
    }
  }
  await recalcOrder(db, orderId);
}

/** Пересчёт при изменении суммы заявки или отгрузок */
export async function recalcOrder(db: DB, orderId: number) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const rows = await db.select({ a: payrollAccruals, r: accrualRules }).from(payrollAccruals)
    .innerJoin(accrualRules, eq(accrualRules.id, payrollAccruals.ruleId))
    .where(and(eq(payrollAccruals.orderId, orderId), inArray(payrollAccruals.kind, MAIN_KINDS), ne(payrollAccruals.status, "cancelled")));
  for (const { a, r } of rows) {
    const base = await baseFor(db, r, o);
    const amount = calcAccrual(base, a.rateBp);
    if (amount !== a.amount || base !== a.baseAmount) {
      await db.update(payrollAccruals).set({ baseAmount: base, amount, updatedAt: new Date(), note: "пересчитано" }).where(eq(payrollAccruals.id, a.id));
    }
  }
}

/** Отмена/удаление заявки — начисления снимаются */
export async function onOrderCancelled(db: DB, orderId: number) {
  await db.update(payrollAccruals).set({ status: "cancelled", updatedAt: new Date(), note: "заявка отменена/удалена" })
    .where(eq(payrollAccruals.orderId, orderId));
}

/** Восстановление заявки из отмены */
export async function onOrderRestored(db: DB, orderId: number) {
  await db.update(payrollAccruals).set({ status: "pending", updatedAt: new Date(), note: "заявка восстановлена" })
    .where(and(eq(payrollAccruals.orderId, orderId), eq(payrollAccruals.status, "cancelled")));
  await syncCoUser(db, orderId);
}

/** Подтверждение по моменту: shipment | paid */
export async function confirmFor(db: DB, orderId: number, moment: "shipment" | "paid") {
  const ids = await db.select({ id: payrollAccruals.id }).from(payrollAccruals)
    .innerJoin(accrualRules, eq(accrualRules.id, payrollAccruals.ruleId))
    .where(and(eq(payrollAccruals.orderId, orderId), eq(payrollAccruals.status, "pending"), eq(accrualRules.moment, moment)));
  for (const { id } of ids) await db.update(payrollAccruals).set({ status: "confirmed", updatedAt: new Date() }).where(eq(payrollAccruals.id, id));
  await recalcOrder(db, orderId);
}

/** Возврат: для правил «от суммы заявки» — минус пропорционально сумме возврата */
export async function onReturn(db: DB, orderId: number, returnShipmentId: number, returnTotal: number, date: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o) return;
  const mains = await db.select({ a: payrollAccruals, r: accrualRules }).from(payrollAccruals)
    .innerJoin(accrualRules, eq(accrualRules.id, payrollAccruals.ruleId))
    .where(and(eq(payrollAccruals.orderId, orderId), inArray(payrollAccruals.kind, MAIN_KINDS), ne(payrollAccruals.status, "cancelled")));
  for (const { a, r } of mains) {
    if (r.base !== "order_total") continue; // для выручки/прибыли база уже учитывает возврат
    await db.insert(payrollAccruals).values({
      ruleId: r.id, orderId, kind: `return:${returnShipmentId}${a.kind === "main:co" ? ":co" : ""}`, recipientId: a.recipientId, authorId: a.authorId,
      baseAmount: -returnTotal, rateBp: a.rateBp, amount: -calcAccrual(returnTotal, a.rateBp), status: a.status, accrualDate: date, note: "возврат",
    }).onConflictDoNothing();
  }
  await recalcOrder(db, orderId);
}

/** Удаление возврата — снимаем минусовую строку */
export async function onReturnDeleted(db: DB, orderId: number, returnShipmentId: number) {
  await db.update(payrollAccruals).set({ status: "cancelled", updatedAt: new Date(), note: "возврат удалён" })
    .where(and(eq(payrollAccruals.orderId, orderId), sql`(${payrollAccruals.kind} = ${`return:${returnShipmentId}`} or ${like(payrollAccruals.kind, `return:${returnShipmentId}:%`)})`));
  await recalcOrder(db, orderId);
}

/** Начисления по заявке (для карточки заявки) */
export async function accrualsForOrder(db: DB, orderId: number) {
  return db.select({
    id: payrollAccruals.id, kind: payrollAccruals.kind, amount: payrollAccruals.amount, baseAmount: payrollAccruals.baseAmount,
    rateBp: payrollAccruals.rateBp, status: payrollAccruals.status, recipientName: users.name, ruleName: accrualRules.name, moment: accrualRules.moment,
  }).from(payrollAccruals)
    .innerJoin(users, eq(users.id, payrollAccruals.recipientId))
    .innerJoin(accrualRules, eq(accrualRules.id, payrollAccruals.ruleId))
    .where(eq(payrollAccruals.orderId, orderId));
}
export { isNull };
