import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import {
  accrualRules, cashAccounts, finCategories, finTransactions, paySchemes, payrollAdjustments, payrollAdvances, payrollPayouts, payrollPeriods, timesheet, users,
} from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertFlag, flag, ForbiddenError, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { addDays, monthRange, money, today } from "@/lib/format";
import { getSetting } from "@/modules/settings/store";
import { notify } from "@/modules/notifications/service";
import { computePayslip, periodFromKey, planForPeriod } from "./engine";
import { paySchemeSchema, type Payslip, type PayslipInput, type Period } from "./types";

/* ───── доступ ───── */

export async function assertPayslipAccess(db: DB, p: Principal, userId: number) {
  if (flag(p, "seeSalaries")) return;
  if (userId === p.id) {
    const s = await getSetting(db, "payroll");
    if (s.employeesSeeOwn || flag(p, "seeOwnEarnings")) return;
    throw new ForbiddenError("Просмотр своего заработка отключён владельцем");
  }
  throw new ForbiddenError("Нет права видеть чужие зарплаты");
}

/* ───── загрузка данных периода ───── */

export function prevPeriodKey(period: Period): string {
  if (period.kind === "month") return addDays(period.start, -1).slice(0, 7);
  if (period.kind === "half") {
    return period.start.endsWith("-16") ? `${period.start.slice(0, 7)}-H1` : `${addDays(period.start, -1).slice(0, 7)}-H2`;
  }
  const prev = addDays(period.start, -7);
  // ISO week key
  const d = new Date(prev + "T00:00:00Z");
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

async function carryIn(db: DB, userId: number, period: Period): Promise<number> {
  const key = prevPeriodKey(period);
  const [pp] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.periodKey, key));
  if (!pp?.closed || !pp.snapshot) return 0;
  const snap = (pp.snapshot as { slips: Payslip[] }).slips.find((s) => s.userId === userId);
  if (!snap) return 0;
  const [{ s }] = await q<{ s: number }>(db, sql`select coalesce(sum(amount),0)::float8 s from payroll_payouts where user_id = ${userId} and period_key = ${key} and deleted_at is null`);
  return snap.toPay - Number(s);
}

export async function loadPayslipInput(db: DB, userId: number, period: Period): Promise<PayslipInput> {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new NotFoundError("Сотрудник не найден");
  const all = await db.select().from(paySchemes).where(and(eq(paySchemes.userId, userId), lte(paySchemes.validFrom, period.end))).orderBy(asc(paySchemes.validFrom), asc(paySchemes.id));
  // последняя схема до начала периода + все, начавшиеся в периоде
  const before = all.filter((s) => s.validFrom <= period.start).pop();
  const inside = all.filter((s) => s.validFrom > period.start);
  // если в один день несколько схем — берём последнюю
  const byDate = new Map<string, (typeof all)[number]>();
  for (const s of [...(before ? [before] : []), ...inside]) byDate.set(s.validFrom, s);
  const schemes = [...byDate.values()].map((s) => ({ validFrom: s.validFrom, components: paySchemeSchema.parse(s.components) }));

  const ts = await db.select().from(timesheet).where(and(eq(timesheet.userId, userId), sql`${timesheet.date} between ${period.start} and ${period.end}`));

  const sales = await q<{
    shipment_id: number; shipment_number: number; order_id: number | null; order_number: number | null; kind: "shipment" | "return"; date: string;
    paid_date: string | null; product_id: number; folder_id: number | null; manager_id: number | null; segment: string; revenue: number; cost: number;
  }>(db, sql`
    with paid as (
      select o.id, (select max(pm.date) from payments pm where pm.order_id = o.id and pm.direction='in' and pm.deleted_at is null)::text as paid_date,
             coalesce((select sum(pm.amount) from payments pm where pm.order_id = o.id and pm.direction='in' and pm.deleted_at is null),0) as paid_sum, o.total
      from orders o where o.deleted_at is null
    )
    select s.id shipment_id, s.number shipment_number, s.order_id, o.number order_number, s.kind, s.date::text date,
      case when pd.paid_sum >= pd.total and pd.total > 0 then pd.paid_date else null end as paid_date,
      si.product_id, p.folder_id, coalesce(o.manager_id, c.manager_id) manager_id, c.segment,
      round(si.qty * si.price)::float8 revenue,
      round(si.qty * case when si.cost > 0 then si.cost else coalesce(lp.price, 0) end)::float8 cost
    from shipment_items si
      join shipments s on s.id = si.shipment_id
      join products p on p.id = si.product_id
      join counterparties c on c.id = s.counterparty_id
      left join orders o on o.id = s.order_id
      left join paid pd on pd.id = s.order_id
      left join lateral (select ri.price from receipt_items ri join receipts r on r.id = ri.receipt_id
        where ri.product_id = si.product_id and r.posted and r.deleted_at is null and ri.price > 0 order by r.date desc limit 1) lp on true
    where s.posted and s.deleted_at is null and s.date <= ${period.end}
      and (s.date >= ${period.start} or (pd.paid_date between ${period.start} and ${period.end}))`);

  const assemblies = await q<{ order_id: number; order_number: number; date: string; items: number; units: number }>(db, sql`
    select o.id order_id, o.number order_number, (o.assembled_at at time zone 'Asia/Almaty')::date::text date,
      (select count(*)::int from order_items oi where oi.order_id = o.id) items,
      (select coalesce(sum(qty),0)::float8 from order_items oi where oi.order_id = o.id) units
    from orders o where o.assembled_by_id = ${userId} and o.deleted_at is null and o.assembly_status = 'assembled'
      and (o.assembled_at at time zone 'Asia/Almaty')::date between ${period.start} and ${period.end}`);

  const accruals = await q<{ id: number; order_id: number; order_number: number; client_name: string; author_name: string; base_amount: number; rate_bp: number;
    amount: number; status: string; kind: string; date: string; rule_name: string; moment: string }>(db, sql`
    select a.id, a.order_id, o.number order_number, c.name client_name, au.name author_name, a.base_amount::float8, a.rate_bp, a.amount::float8, a.status, a.kind,
      a.accrual_date::text date, r.name rule_name, r.moment
    from payroll_accruals a join orders o on o.id = a.order_id join counterparties c on c.id = o.counterparty_id
      join users au on au.id = a.author_id join accrual_rules r on r.id = a.rule_id
    where a.recipient_id = ${userId} and a.accrual_date between ${period.start} and ${period.end} order by a.accrual_date, a.id`);

  const adjustments = await db.select().from(payrollAdjustments).where(and(eq(payrollAdjustments.userId, userId), isNull(payrollAdjustments.deletedAt), sql`${payrollAdjustments.date} between ${period.start} and ${period.end}`));
  const advances = await db.select().from(payrollAdvances).where(and(eq(payrollAdvances.userId, userId), eq(payrollAdvances.periodKey, period.key), isNull(payrollAdvances.deletedAt)));
  const payouts = await db.select().from(payrollPayouts).where(and(eq(payrollPayouts.userId, userId), eq(payrollPayouts.periodKey, period.key), isNull(payrollPayouts.deletedAt)));

  const [tk] = await q<{ total: number; on_time: number }>(db, sql`select count(*)::int total, count(*) filter (where completed_at <= due_at)::int on_time
    from tasks where assignee_id = ${userId} and deleted_at is null and due_at is not null and completed_at is not null
      and (completed_at at time zone 'Asia/Almaty')::date between ${period.start} and ${period.end}`);

  return {
    period, schemes, userId,
    timesheet: ts.map((t) => ({ date: t.date, status: t.status as never, hours: t.hours })),
    sales: sales.map((s) => ({
      shipmentId: s.shipment_id, shipmentNumber: s.shipment_number, orderId: s.order_id, orderNumber: s.order_number, kind: s.kind, date: s.date, paidDate: s.paid_date,
      productId: s.product_id, folderId: s.folder_id, managerId: s.manager_id, segment: s.segment, revenue: Number(s.revenue), cost: Number(s.cost),
    })),
    assemblies: assemblies.map((a) => ({ orderId: a.order_id, orderNumber: a.order_number, date: a.date, items: a.items, units: Number(a.units) })),
    accruals: accruals.map((a) => ({
      id: a.id, orderId: a.order_id, orderNumber: a.order_number, clientName: a.client_name, authorName: a.author_name, baseAmount: Number(a.base_amount), rateBp: a.rate_bp,
      amount: Number(a.amount), status: a.status, kind: a.kind, date: a.date, ruleName: a.rule_name, counted: a.moment === "order_created" ? a.status !== "cancelled" : a.status === "confirmed",
    })),
    adjustments: adjustments.map((a) => ({ id: a.id, date: a.date, type: a.type as never, amount: a.amount, hours: a.hours, comment: a.comment })),
    advances: advances.map((a) => ({ id: a.id, date: a.date, amount: a.amount, comment: a.comment })),
    payouts: payouts.map((a) => ({ id: a.id, date: a.date, amount: a.amount, comment: a.comment })),
    carryIn: await carryIn(db, userId, period),
    plan: planForPeriod(u.weeklyPlan, period),
    tasks: { total: tk?.total ?? 0, onTime: tk?.on_time ?? 0 },
  };
}

export async function payslip(db: DB, p: Principal, userId: number, key: string) {
  await assertPayslipAccess(db, p, userId);
  const period = periodFromKey(key);
  const [pp] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.periodKey, key));
  if (pp?.closed && pp.snapshot) {
    const snap = (pp.snapshot as { slips: Payslip[] }).slips.find((s) => s.userId === userId);
    if (snap) {
      const payouts = await db.select().from(payrollPayouts).where(and(eq(payrollPayouts.userId, userId), eq(payrollPayouts.periodKey, key), isNull(payrollPayouts.deletedAt)));
      const paid = payouts.reduce((s, x) => s + x.amount, 0);
      return { ...snap, payouts: paid, balanceAfterPayouts: snap.toPay - paid, closed: true, closedAt: pp.closedAt, payoutRows: payouts };
    }
  }
  const input = await loadPayslipInput(db, userId, period);
  const slip = computePayslip(input);
  return { ...slip, closed: false, closedAt: null, payoutRows: input.payouts };
}

/** Ведомость по всем сотрудникам */
export async function payrollSheet(db: DB, p: Principal, key: string) {
  assertFlag(p, "seeSalaries");
  const staff = await db.select({ id: users.id, name: users.name, position: users.position }).from(users).where(and(eq(users.active, true), isNull(users.deletedAt))).orderBy(asc(users.name));
  const slips = [];
  for (const u of staff) slips.push({ user: u, slip: await payslip(db, p, u.id, key) });
  const [pp] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.periodKey, key));
  return { period: periodFromKey(key), closed: !!pp?.closed, closedAt: pp?.closedAt ?? null, slips };
}

export async function closePeriod(db: DB, p: Principal, key: string) {
  assertFlag(p, "payrollClosePeriod");
  const period = periodFromKey(key);
  const [pp] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.periodKey, key));
  if (pp?.closed) throw new ValidationError("Период уже закрыт");
  const staff = await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), isNull(users.deletedAt)));
  const slips: Payslip[] = [];
  for (const u of staff) slips.push(computePayslip(await loadPayslipInput(db, u.id, period)));
  const snapshot = { slips, closedBy: p.id, at: new Date().toISOString() };
  await db.insert(payrollPeriods).values({ periodKey: key, start: period.start, end: period.end, closed: true, closedAt: new Date(), closedBy: p.id, snapshot })
    .onConflictDoUpdate({ target: payrollPeriods.periodKey, set: { closed: true, closedAt: new Date(), closedBy: p.id, snapshot } });
  await audit(db, p, "close", "payroll_period", key, `Закрыт зарплатный период ${period.label}`, { total: slips.reduce((s, x) => s + x.accrued, 0) });
  await notify(db, staff.map((s) => s.id), { type: "payroll", title: `Зарплатный период закрыт: ${period.label}`, body: "Расчётный лист зафиксирован", link: `/payroll/me?period=${key}` });
}

export async function reopenPeriod(db: DB, p: Principal, key: string, reason: string) {
  assertFlag(p, "payrollClosePeriod");
  if (!reason.trim()) throw new ValidationError("Укажите причину");
  await db.update(payrollPeriods).set({ closed: false }).where(eq(payrollPeriods.periodKey, key));
  await audit(db, p, "reopen", "payroll_period", key, `Открыт для правки период ${key}: ${reason}`);
}

async function assertOpen(db: DB, date: string) {
  const rows = await db.select().from(payrollPeriods).where(and(eq(payrollPeriods.closed, true), sql`${payrollPeriods.start} <= ${date} and ${payrollPeriods.end} >= ${date}`));
  if (rows.length) throw new ValidationError(`Период ${rows[0].periodKey} закрыт — сначала откройте его`);
}

/* ───── схемы и правила ───── */

export async function listSchemes(db: DB, p: Principal, userId?: number) {
  assertFlag(p, "seeSalaries");
  return db.select({ s: paySchemes, userName: users.name }).from(paySchemes).innerJoin(users, eq(users.id, paySchemes.userId))
    .where(userId ? eq(paySchemes.userId, userId) : undefined).orderBy(asc(users.name), desc(paySchemes.validFrom));
}

export async function saveScheme(db: DB, p: Principal, input: { userId: number; validFrom: string; components: unknown; comment?: string }) {
  assertFlag(p, "payrollEditSchemes");
  const components = paySchemeSchema.parse(input.components);
  const [s] = await db.insert(paySchemes).values({ userId: input.userId, validFrom: input.validFrom, components, comment: input.comment ?? "", createdBy: p.id }).returning();
  await audit(db, p, "create", "pay_scheme", s.id, `Новая схема оплаты для сотрудника #${input.userId} с ${input.validFrom}`, components);
  return s;
}

export const ruleInput = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1),
  authorMatch: z.enum(["user", "sales_manager", "any"]),
  authorUserId: z.number().int().nullable().optional(),
  recipientMode: z.enum(["author", "user", "manager"]),
  recipientUserId: z.number().int().nullable().optional(),
  rateBp: z.number().int().min(1).max(10000),
  base: z.enum(["order_total", "shipment_revenue", "profit"]),
  moment: z.enum(["order_created", "shipment", "paid"]),
  segment: z.enum(["bazaar", "shop", "install", "other"]).nullable().optional(),
  active: z.boolean().default(true),
  validFrom: z.string().nullable().optional(),
});

export async function listRules(db: DB, p: Principal) {
  assertFlag(p, "seeSalaries");
  return db.select().from(accrualRules).orderBy(asc(accrualRules.id));
}
export async function saveRule(db: DB, p: Principal, input: z.infer<typeof ruleInput>) {
  assertFlag(p, "payrollEditSchemes");
  if (input.authorMatch === "user" && !input.authorUserId) throw new ValidationError("Выберите автора заявки");
  if (input.recipientMode === "user" && !input.recipientUserId) throw new ValidationError("Выберите получателя");
  const v = { ...input, authorUserId: input.authorUserId ?? null, recipientUserId: input.recipientUserId ?? null, segment: input.segment ?? null, validFrom: input.validFrom ?? null };
  const { id, ...rest } = v;
  const [r] = id ? await db.update(accrualRules).set(rest).where(eq(accrualRules.id, id)).returning() : await db.insert(accrualRules).values(rest).returning();
  await audit(db, p, id ? "update" : "create", "accrual_rule", r.id, `Правило начисления «${r.name}»: ${r.rateBp / 100}%`, rest);
  return r;
}

/* ───── табель ───── */

export async function getTimesheet(db: DB, p: Principal, month: string) {
  if (!flag(p, "payrollTimesheet") && !flag(p, "seeSalaries")) throw new ForbiddenError("Нет права вести табель");
  const r = monthRange(month + "-01");
  const rows = await db.select().from(timesheet).where(sql`${timesheet.date} between ${r.start} and ${r.end}`);
  return { ...r, rows };
}

export async function setTimesheet(db: DB, p: Principal, input: { userId: number; date: string; status: string; hours: number }) {
  const s = await getSetting(db, "payroll");
  const self = input.userId === p.id && s.selfCheckin;
  if (!self && !flag(p, "payrollTimesheet")) throw new ForbiddenError("Нет права вести табель");
  await assertOpen(db, input.date);
  if (input.status === "clear") {
    await db.delete(timesheet).where(and(eq(timesheet.userId, input.userId), eq(timesheet.date, input.date)));
  } else {
    await db.insert(timesheet).values({ userId: input.userId, date: input.date, status: input.status, hours: input.hours, authorId: p.id })
      .onConflictDoUpdate({ target: [timesheet.userId, timesheet.date], set: { status: input.status, hours: input.hours, authorId: p.id } });
  }
  await audit(db, p, "update", "timesheet", `${input.userId}:${input.date}`, `Табель: сотрудник #${input.userId}, ${input.date} — ${input.status} ${input.hours} ч`);
}

/** Отметка прихода/ухода самим сотрудником */
export async function checkInOut(db: DB, p: Principal) {
  const s = await getSetting(db, "payroll");
  if (!s.selfCheckin) throw new ForbiddenError("Самостоятельная отметка отключена");
  const d = today();
  const [row] = await db.select().from(timesheet).where(and(eq(timesheet.userId, p.id), eq(timesheet.date, d)));
  if (!row?.checkIn) {
    await db.insert(timesheet).values({ userId: p.id, date: d, status: "present", hours: 0, checkIn: new Date(), authorId: p.id })
      .onConflictDoUpdate({ target: [timesheet.userId, timesheet.date], set: { status: "present", checkIn: new Date() } });
    return "in" as const;
  }
  const hours = Math.round(((Date.now() - row.checkIn.getTime()) / 3600000) * 4) / 4;
  await db.update(timesheet).set({ checkOut: new Date(), hours }).where(eq(timesheet.id, row.id));
  return "out" as const;
}

/* ───── бонусы/штрафы/авансы/выплаты ───── */

export const adjustmentInput = z.object({
  userId: z.number().int(), date: z.string(), type: z.enum(["bonus", "penalty", "expense", "weekend", "overtime"]),
  amount: z.number().int().min(0), hours: z.number().nullable().optional(), comment: z.string().trim().min(1, "Укажите комментарий"),
});
export async function addAdjustment(db: DB, p: Principal, input: z.infer<typeof adjustmentInput>) {
  assertFlag(p, "payrollPay");
  await assertOpen(db, input.date);
  const [a] = await db.insert(payrollAdjustments).values({ ...input, hours: input.hours ?? null, authorId: p.id }).returning();
  await audit(db, p, "create", "payroll_adjustment", a.id, `${ADJ_NAMES[input.type]} сотруднику #${input.userId}: ${money(input.amount)} — ${input.comment}`);
  return a;
}
const ADJ_NAMES = { bonus: "Бонус", penalty: "Штраф", expense: "Расход", weekend: "Выход в выходной", overtime: "Сверхурочные" } as const;

/** Штрафы сотрудника за месяц даты (нарастающим итогом) и подсказка суммы следующего штрафа */
export async function penaltyInfo(db: DB, p: Principal, userId: number, date: string) {
  assertFlag(p, "payrollPay");
  const m = monthRange(date);
  const [r] = await q<{ count: number; sum: number }>(db, sql`select count(*)::int count, coalesce(sum(amount),0)::float8 sum from payroll_adjustments
    where user_id = ${userId} and type = 'penalty' and deleted_at is null and date between ${m.start} and ${m.end}`);
  const cfg = await getSetting(db, "payroll");
  const count = r?.count ?? 0, sum = Number(r?.sum ?? 0);
  const base = cfg.penaltyBase ?? 0, step = cfg.penaltyStep ?? 0;
  return { count, sum, suggested: base > 0 ? base + step * count : null };
}

export async function deleteAdjustment(db: DB, p: Principal, id: number) {
  assertFlag(p, "payrollPay");
  const [a] = await db.select().from(payrollAdjustments).where(eq(payrollAdjustments.id, id));
  if (!a) throw new NotFoundError();
  await assertOpen(db, a.date);
  await db.update(payrollAdjustments).set({ deletedAt: new Date() }).where(eq(payrollAdjustments.id, id));
  await audit(db, p, "delete", "payroll_adjustment", id, `Удалена корректировка ${money(a.amount)}`);
}

async function salaryCategory(db: DB) {
  const [c] = await db.select().from(finCategories).where(eq(finCategories.code, "salary"));
  return c?.id ?? null;
}

export const payInput = z.object({
  userId: z.number().int(), periodKey: z.string(), amount: z.number().int().positive(), date: z.string().default(() => today()),
  accountId: z.number().int(), comment: z.string().default(""),
});

export async function addAdvance(db: DB, p: Principal, input: z.infer<typeof payInput>) {
  assertFlag(p, "payrollPay");
  return payMoney(db, p, input, "advance");
}
export async function addPayout(db: DB, p: Principal, input: z.infer<typeof payInput>) {
  assertFlag(p, "payrollPay");
  return payMoney(db, p, input, "payout");
}

async function payMoney(db: DB, p: Principal, input: z.infer<typeof payInput>, kind: "advance" | "payout") {
  periodFromKey(input.periodKey);
  const [acc] = await db.select().from(cashAccounts).where(eq(cashAccounts.id, input.accountId));
  if (!acc) throw new ValidationError("Касса не найдена");
  const [u] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!u) throw new NotFoundError();
  const cat = await salaryCategory(db);
  const id = await db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const [t] = await tx.insert(finTransactions).values({ date: input.date, kind: "expense", accountId: acc.id, categoryId: cat, amount: input.amount, employeeId: u.id, authorId: p.id,
      comment: `${kind === "advance" ? "Аванс" : "Выплата зарплаты"}: ${u.name}, период ${input.periodKey}${input.comment ? ". " + input.comment : ""}` }).returning();
    const table = kind === "advance" ? payrollAdvances : payrollPayouts;
    const [r] = await tx.insert(table).values({ userId: u.id, periodKey: input.periodKey, date: input.date, amount: input.amount, accountId: acc.id, finTxId: t.id, comment: input.comment, authorId: p.id }).returning();
    await audit(tx, p, "create", kind === "advance" ? "payroll_advance" : "payroll_payout", r.id, `${kind === "advance" ? "Аванс" : "Выплата"} ${u.name}: ${money(input.amount)} (${acc.name})`);
    return r.id;
  });
  await notify(db, [u.id], { type: "payroll", title: kind === "advance" ? "Выдан аванс" : "Проведена выплата зарплаты", body: `${money(input.amount)} · ${acc.name}`, link: `/payroll/me?period=${input.periodKey}` });
  return id;
}

export async function deletePayMoney(db: DB, p: Principal, kind: "advance" | "payout", id: number) {
  assertFlag(p, "payrollPay");
  const table = kind === "advance" ? payrollAdvances : payrollPayouts;
  const [r] = await db.select().from(table).where(eq(table.id, id));
  if (!r) throw new NotFoundError();
  await db.update(table).set({ deletedAt: new Date() }).where(eq(table.id, id));
  if (r.finTxId) await db.update(finTransactions).set({ deletedAt: new Date() }).where(eq(finTransactions.id, r.finTxId));
  await audit(db, p, "delete", `payroll_${kind}`, id, `Удалён${kind === "advance" ? " аванс" : "а выплата"} ${money(r.amount)}`);
}

export async function listPayMoney(db: DB, p: Principal, key: string) {
  assertFlag(p, "seeSalaries");
  const adv = await db.select({ r: payrollAdvances, name: users.name }).from(payrollAdvances).innerJoin(users, eq(users.id, payrollAdvances.userId))
    .where(and(eq(payrollAdvances.periodKey, key), isNull(payrollAdvances.deletedAt))).orderBy(desc(payrollAdvances.date));
  const pay = await db.select({ r: payrollPayouts, name: users.name }).from(payrollPayouts).innerJoin(users, eq(users.id, payrollPayouts.userId))
    .where(and(eq(payrollPayouts.periodKey, key), isNull(payrollPayouts.deletedAt))).orderBy(desc(payrollPayouts.date));
  const adj = await db.select({ r: payrollAdjustments, name: users.name }).from(payrollAdjustments).innerJoin(users, eq(users.id, payrollAdjustments.userId))
    .where(and(isNull(payrollAdjustments.deletedAt), sql`${payrollAdjustments.date} between ${periodFromKey(key).start} and ${periodFromKey(key).end}`)).orderBy(desc(payrollAdjustments.date));
  return { advances: adv, payouts: pay, adjustments: adj };
}

export function currentPeriodKey(kind: "month" | "half" | "week" = "month", d = today()) {
  if (kind === "month") return d.slice(0, 7);
  if (kind === "half") return `${d.slice(0, 7)}-H${Number(d.slice(8)) <= 15 ? 1 : 2}`;
  const dt = new Date(d + "T00:00:00Z");
  const wd = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - wd);
  const y = dt.getUTCFullYear();
  return `${y}-W${String(Math.ceil(((dt.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`;
}
