import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { cashAccounts, counterparties, finCategories, finTransactions, orders, orderStatuses, payments, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, flag, ForbiddenError, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { money, today } from "@/lib/format";
import * as acc from "@/modules/payroll/accruals";
import { emitWebhook } from "@/modules/webhooks/service";

/* ───────────── Оплаты ───────────── */

export const paymentInput = z.object({
  direction: z.enum(["in", "out"]),
  counterpartyId: z.number().int({ error: "Выберите контрагента" }),
  amount: z.number().int().positive("Сумма > 0"),
  method: z.enum(["cash", "kaspi", "transfer"]).default("cash"),
  accountId: z.number().int().nullable().optional(),
  date: z.string().default(() => today()),
  orderId: z.number().int().nullable().optional(),
  shipmentId: z.number().int().nullable().optional(),
  receiptId: z.number().int().nullable().optional(),
  comment: z.string().max(2000).default(""),
});
export type PaymentInput = z.infer<typeof paymentInput>;

export const METHODS = { cash: "Наличные", kaspi: "Kaspi", transfer: "Перевод" } as const;

async function accountFor(db: DB, method: string) {
  const kind = method === "cash" ? "cash" : method === "kaspi" ? "kaspi" : "bank";
  const [a] = await db.select().from(cashAccounts).where(and(eq(cashAccounts.kind, kind), eq(cashAccounts.active, true))).limit(1);
  const [any] = a ? [a] : await db.select().from(cashAccounts).where(eq(cashAccounts.active, true)).limit(1);
  return any?.id ?? null;
}
async function categoryByCode(db: DB, code: string) {
  const [c] = await db.select().from(finCategories).where(eq(finCategories.code, code));
  return c?.id ?? null;
}

export async function createPayment(db: DB, p: Principal, input: PaymentInput) {
  assertCan(p, "payments", "full");
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, input.counterpartyId));
  if (!cp) throw new ValidationError("Контрагент не найден");
  const accountId = input.accountId ?? (await accountFor(db, input.method));
  if (!accountId) throw new ValidationError("Не настроены кассы/счета");
  let paidOrder = null as { id: number; number: number } | null;
  const id = await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const number = await nextNumber(tx, `payment_${input.direction}`);
    const [pm] = await tx.insert(payments).values({ ...input, number, accountId, authorId: p.id,
      orderId: input.orderId ?? null, shipmentId: input.shipmentId ?? null, receiptId: input.receiptId ?? null }).returning();
    await tx.insert(finTransactions).values({
      date: input.date, kind: input.direction === "in" ? "income" : "expense", accountId, amount: input.amount, paymentId: pm.id, authorId: p.id,
      categoryId: await categoryByCode(tx, input.direction === "in" ? "client_payment" : "supplier_payment"),
      comment: `${input.direction === "in" ? "Оплата от" : "Оплата"} ${cp.name}${input.comment ? ": " + input.comment : ""}`,
    });
    await audit(tx, p, "create", "payment", pm.id, `${input.direction === "in" ? "Оплата от клиента" : "Оплата поставщику"} №${number}: ${cp.name}, ${money(input.amount)} (${METHODS[input.method]})`);
    // Автостатус «Оплачен», если оплачено полностью
    if (input.direction === "in" && input.orderId) {
      const [o] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
      const [{ s }] = await q<{ s: number }>(tx, sql`select coalesce(sum(amount),0)::float8 s from payments where order_id = ${input.orderId} and direction='in' and deleted_at is null`);
      const [paid] = await tx.select().from(orderStatuses).where(eq(orderStatuses.code, "paid"));
      if (o && paid && Number(s) >= o.total && o.statusId !== paid.id) {
        await tx.update(orders).set({ statusId: paid.id, updatedAt: new Date() }).where(eq(orders.id, o.id));
        await tx.execute(sql`insert into order_status_history (order_id, status_id, user_id, comment) values (${o.id}, ${paid.id}, ${p.id}, ${"Автоматически: оплачено полностью"})`);
        await acc.confirmFor(tx, o.id, "paid");
        paidOrder = { id: o.id, number: o.number };
      }
    }
    return pm.id;
  });
  emitWebhook(db, "payment.created", { id, direction: input.direction, counterpartyId: input.counterpartyId, amount: input.amount, orderId: input.orderId ?? null });
  return { id, paidOrder: paidOrder as { id: number; number: number } | null };
}

export async function deletePayment(db: DB, p: Principal, id: number) {
  assertCan(p, "payments", "full");
  if (!flag(p, "deleteDocs")) throw new ValidationError("Удаление оплаты требует права «Удалять документы»");
  const [pm] = await db.select().from(payments).where(and(eq(payments.id, id), isNull(payments.deletedAt)));
  if (!pm) throw new NotFoundError();
  await db.update(payments).set({ deletedAt: new Date() }).where(eq(payments.id, id));
  await db.update(finTransactions).set({ deletedAt: new Date() }).where(eq(finTransactions.paymentId, id));
  await audit(db, p, "delete", "payment", id, `Удалена оплата №${pm.number} на ${money(pm.amount)}`);
}

export async function listPayments(db: DB, p: Principal, params: { direction?: string; counterpartyId?: number; q?: string; from?: string; to?: string; page?: number; pageSize?: number } = {}) {
  assertCan(p, "payments");
  const page = Math.max(1, params.page ?? 1), size = Math.min(200, params.pageSize ?? 30);
  const conds: (SQL | undefined)[] = [isNull(payments.deletedAt)];
  if (params.direction) conds.push(eq(payments.direction, params.direction));
  if (params.counterpartyId) conds.push(eq(payments.counterpartyId, params.counterpartyId));
  if (params.from) conds.push(sql`${payments.date} >= ${params.from}`);
  if (params.to) conds.push(sql`${payments.date} <= ${params.to}`);
  if (params.q) conds.push(sql`lower(${counterparties.name}) like ${"%" + params.q.toLowerCase() + "%"}`);
  const where = and(...conds);
  const rows = await db.select({ id: payments.id, number: payments.number, direction: payments.direction, amount: payments.amount, method: payments.method, date: payments.date,
    comment: payments.comment, counterpartyId: payments.counterpartyId, counterpartyName: counterparties.name, orderId: payments.orderId, orderNumber: orders.number,
    receiptId: payments.receiptId, accountName: cashAccounts.name })
    .from(payments).innerJoin(counterparties, eq(counterparties.id, payments.counterpartyId))
    .leftJoin(orders, eq(orders.id, payments.orderId)).leftJoin(cashAccounts, eq(cashAccounts.id, payments.accountId))
    .where(where).orderBy(desc(payments.date), desc(payments.id)).limit(size).offset((page - 1) * size);
  const [{ c, s }] = await db.select({ c: sql<number>`count(*)::int`, s: sql<number>`coalesce(sum(${payments.amount}),0)::float8` }).from(payments)
    .innerJoin(counterparties, eq(counterparties.id, payments.counterpartyId)).where(where);
  return { rows, total: c, sum: Number(s), page, pageSize: size };
}

export async function getPayment(db: DB, p: Principal, id: number) {
  assertCan(p, "payments");
  const [r] = await db.select({ pm: payments, cp: counterparties, acc: cashAccounts }).from(payments)
    .innerJoin(counterparties, eq(counterparties.id, payments.counterpartyId)).leftJoin(cashAccounts, eq(cashAccounts.id, payments.accountId))
    .where(eq(payments.id, id));
  if (!r) throw new NotFoundError();
  const [o] = r.pm.orderId ? await db.select({ id: orders.id, number: orders.number }).from(orders).where(eq(orders.id, r.pm.orderId)) : [];
  return { ...r.pm, counterparty: r.cp, account: r.acc, order: o ?? null };
}

/* ───────────── Финансы: кассы, операции, отчёты ───────────── */

export const finTxInput = z.object({
  date: z.string().default(() => today()),
  kind: z.enum(["income", "expense", "transfer"]),
  accountId: z.number().int(),
  toAccountId: z.number().int().nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  amount: z.number().int().positive("Сумма > 0"),
  comment: z.string().max(1000).default(""),
  employeeId: z.number().int().nullable().optional(),
});

function assertFinance(p: Principal, need: "view" | "full" = "view") { assertCan(p, "finance", need); }

export async function listAccounts(db: DB) { return db.select().from(cashAccounts).orderBy(asc(cashAccounts.id)); }
export async function listCategories(db: DB) { return db.select().from(finCategories).orderBy(asc(finCategories.kind), asc(finCategories.name)); }

export async function createFinTx(db: DB, p: Principal, input: z.infer<typeof finTxInput>) {
  assertFinance(p, "full");
  if (input.kind === "transfer" && (!input.toAccountId || input.toAccountId === input.accountId)) throw new ValidationError("Выберите другую кассу для перевода");
  const [cat] = input.categoryId ? await db.select().from(finCategories).where(eq(finCategories.id, input.categoryId)) : [];
  if (cat?.code === "salary" && !flag(p, "payrollPay")) throw new ForbiddenError("Зарплатные операции — через раздел «Зарплата»");
  const [t] = await db.insert(finTransactions).values({ ...input, toAccountId: input.toAccountId ?? null, categoryId: input.categoryId ?? null, employeeId: input.employeeId ?? null, authorId: p.id }).returning();
  await audit(db, p, "create", "fin_tx", t.id, `${input.kind === "income" ? "Поступление" : input.kind === "expense" ? "Расход" : "Перевод"} ${money(input.amount)}`);
  return t;
}

export async function deleteFinTx(db: DB, p: Principal, id: number) {
  assertFinance(p, "full");
  const [t] = await db.select().from(finTransactions).where(eq(finTransactions.id, id));
  if (!t) throw new NotFoundError();
  if (t.paymentId) throw new ValidationError("Операция создана оплатой — удалите оплату");
  await db.update(finTransactions).set({ deletedAt: new Date() }).where(eq(finTransactions.id, id));
  await audit(db, p, "delete", "fin_tx", id, `Удалена операция ${money(t.amount)}`);
}

/** Операции; зарплатные скрыты без права seeSalaries */
export async function listFinTx(db: DB, p: Principal, params: { from?: string; to?: string; accountId?: number; kind?: string; categoryId?: number; page?: number } = {}) {
  assertFinance(p);
  const conds: (SQL | undefined)[] = [isNull(finTransactions.deletedAt)];
  if (params.from) conds.push(sql`${finTransactions.date} >= ${params.from}`);
  if (params.to) conds.push(sql`${finTransactions.date} <= ${params.to}`);
  if (params.accountId) conds.push(sql`(${finTransactions.accountId} = ${params.accountId} or ${finTransactions.toAccountId} = ${params.accountId})`);
  if (params.kind) conds.push(eq(finTransactions.kind, params.kind));
  if (params.categoryId) conds.push(eq(finTransactions.categoryId, params.categoryId));
  if (!flag(p, "seeSalaries")) conds.push(sql`coalesce(${finCategories.code}, '') <> 'salary'`);
  const page = Math.max(1, params.page ?? 1);
  const rows = await db.select({ id: finTransactions.id, date: finTransactions.date, kind: finTransactions.kind, amount: finTransactions.amount, comment: finTransactions.comment,
    accountId: finTransactions.accountId, toAccountId: finTransactions.toAccountId, categoryName: finCategories.name, categoryCode: finCategories.code, paymentId: finTransactions.paymentId,
    employeeName: users.name })
    .from(finTransactions).leftJoin(finCategories, eq(finCategories.id, finTransactions.categoryId)).leftJoin(users, eq(users.id, finTransactions.employeeId))
    .where(and(...conds)).orderBy(desc(finTransactions.date), desc(finTransactions.id)).limit(50).offset((page - 1) * 50);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(finTransactions).leftJoin(finCategories, eq(finCategories.id, finTransactions.categoryId)).where(and(...conds));
  return { rows, total: c, page };
}

/** Баланс по кассам на дату */
export async function accountBalances(db: DB, p: Principal, until?: string) {
  assertFinance(p);
  const d = until ?? "9999-12-31";
  const rows = await q<{ id: number; name: string; kind: string; balance: number }>(db, sql`
    select a.id, a.name, a.kind,
      coalesce((select sum(case when t.kind='income' then t.amount when t.kind='expense' then -t.amount when t.kind='transfer' then -t.amount end)
        from fin_transactions t where t.account_id = a.id and t.deleted_at is null and t.date <= ${d}), 0)
      + coalesce((select sum(t.amount) from fin_transactions t where t.to_account_id = a.id and t.kind='transfer' and t.deleted_at is null and t.date <= ${d}), 0) as balance
    from cash_accounts a where a.active order by a.id`);
  return rows.map((r) => ({ ...r, balance: Number(r.balance) }));
}

/** ДДС: по категориям за период */
export async function cashFlow(db: DB, p: Principal, from: string, to: string) {
  assertFinance(p);
  const hideSalary = !flag(p, "seeSalaries");
  const rows = await q<{ kind: string; category: string | null; code: string | null; amount: number }>(db, sql`
    select t.kind, c.name as category, c.code, sum(t.amount)::float8 as amount from fin_transactions t left join fin_categories c on c.id = t.category_id
    where t.deleted_at is null and t.kind in ('income','expense') and t.date between ${from} and ${to}
    group by t.kind, c.name, c.code order by t.kind, amount desc`);
  const visible = rows.map((r) => ({ ...r, amount: Number(r.amount), category: hideSalary && r.code === "salary" ? "Зарплата (скрыто)" : r.category ?? "Без категории" }));
  const income = visible.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0);
  const expense = visible.filter((r) => r.kind === "expense").reduce((s, r) => s + r.amount, 0);
  const byDay = await q<{ d: string; income: number; expense: number }>(db, sql`
    select t.date::text d, sum(case when t.kind='income' then t.amount else 0 end)::float8 income, sum(case when t.kind='expense' then t.amount else 0 end)::float8 expense
    from fin_transactions t where t.deleted_at is null and t.date between ${from} and ${to} group by t.date order by t.date`);
  return { rows: visible, income, expense, net: income - expense, byDay: byDay.map((r) => ({ d: r.d, income: Number(r.income), expense: Number(r.expense) })) };
}

export async function saveAccount(db: DB, p: Principal, input: { id?: number; name: string; kind: string; active?: boolean }) {
  assertCan(p, "settings", "full");
  if (input.id) return db.update(cashAccounts).set({ name: input.name, kind: input.kind, active: input.active ?? true }).where(eq(cashAccounts.id, input.id));
  return db.insert(cashAccounts).values({ name: input.name, kind: input.kind });
}
export async function saveCategory(db: DB, p: Principal, input: { id?: number; name: string; kind: string }) {
  assertCan(p, "settings", "full");
  if (input.id) return db.update(finCategories).set({ name: input.name }).where(eq(finCategories.id, input.id));
  return db.insert(finCategories).values({ name: input.name, kind: input.kind });
}
