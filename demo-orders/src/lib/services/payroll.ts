import fs from "fs";
import { getData, mutateData, mutateDataLocked } from "@/lib/db";
import {
  calcAssemblerEarnings,
  calcAvailableAdvance,
  canIssueAdvance,
} from "@/lib/domain/calculations";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import { uploadPath } from "@/lib/uploads";
import { getSettings } from "@/lib/services/settings";
import { createNotification } from "@/lib/services/notifications";
import type {
  ActivityLog,
  Advance,
  AppData,
  Employee,
  MediaItem,
  PaymentMethod,
  Penalty,
  SalaryPayment,
  SalaryRecord,
} from "@/types";

export class PayrollError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

export type PayrollActor = { id: string; name: string };

export type PayrollFilter = {
  employeeId?: string | null;
  from?: string | null;
  to?: string | null;
  paymentMethod?: PaymentMethod | null;
};

function inRange(date: string, filter: PayrollFilter): boolean {
  const day = date.slice(0, 10);
  if (filter.from && day < filter.from) return false;
  if (filter.to && day > filter.to) return false;
  return true;
}

function byDateDesc<T extends { date: string }>(a: T, b: T): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

function pushActivity(
  data: AppData,
  companyId: string,
  actor: PayrollActor,
  action: string,
  entityType: string,
  entityId: string,
) {
  const entry: ActivityLog = {
    id: generateId("act"),
    companyId,
    actorId: actor.id,
    actorName: actor.name,
    action,
    entityType,
    entityId,
    createdAt: nowIso(),
  };
  data.activityLog.unshift(entry);
}

function findEmployee(data: AppData, companyId: string, employeeId: string): Employee {
  const employee = data.employees.find(
    (e) => e.id === employeeId && e.companyId === companyId,
  );
  if (!employee) throw new PayrollError("Сотрудник не найден", 404);
  return employee;
}

function money(amount: number): string {
  return `${amount.toLocaleString("ru-KZ")} ₸`;
}

function advanceDetails(data: AppData, advance: Advance): string {
  const employee = data.employees.find((e) => e.companyId === advance.companyId && e.id === advance.employeeId);
  const method = advance.paymentMethod === "cashless" ? "безналичный" : "наличные";
  return `Сотрудник: ${employee?.fullName ?? advance.employeeId}; сумма: ${money(advance.amount)}; дата: ${advance.date}; способ: ${method}; назначение: ${advance.comment ?? "—"}; заказ: ${advance.orderId ?? "—"}`;
}

export function listSalaries(companyId: string): SalaryRecord[] {
  return getData()
    .salaries.filter((s) => s.companyId === companyId)
    .sort((a, b) => (a.period < b.period ? 1 : -1));
}

export function listAdvances(companyId: string, filter: PayrollFilter = {}): Advance[] {
  return getData()
    .advances.filter(
      (a) =>
        a.companyId === companyId &&
        (!filter.employeeId || a.employeeId === filter.employeeId) &&
        (!filter.paymentMethod || a.paymentMethod === filter.paymentMethod) &&
        inRange(a.date, filter),
    )
    .sort(byDateDesc);
}

export function listPenalties(companyId: string): Penalty[] {
  return getData()
    .penalties.filter((p) => p.companyId === companyId)
    .sort(byDateDesc);
}

export function listSalaryPayments(
  companyId: string,
  filter: PayrollFilter = {},
): SalaryPayment[] {
  return getData()
    .salaryPayments.filter(
      (p) =>
        p.companyId === companyId &&
        (!filter.employeeId || p.employeeId === filter.employeeId) &&
        inRange(p.date, filter),
    )
    .sort((a, b) => byDateDesc(a, b) || (a.createdAt < b.createdAt ? 1 : -1));
}

export function sumAmounts(rows: { amount: number }[]): number {
  return rows.reduce((s, r) => s + r.amount, 0);
}

type Earnings = {
  employeeId: string;
  percent: number;
  orderEarnings: { orderId: string; orderNumber: string; amount: number; earned: number }[];
  totalEarned: number;
  /** Заработок по текущим (незакрытым) заказам — база лимита аванса. */
  activeEarned: number;
  advancesIssued: number;
  penaltiesTotal: number;
  net: number;
};

/** Статусы «текущих» заказов, от которых считается лимит аванса. */
const ACTIVE_ORDER_STATUSES = new Set(["production", "installation"]);

/** Личный % лимита аванса сотрудника или общий из настроек. */
export function advancePercentFor(
  employee: Pick<Employee, "advanceMaxPercent"> | undefined,
  companyDefault: number,
): number {
  const own = employee?.advanceMaxPercent;
  return typeof own === "number" && Number.isFinite(own) ? own : companyDefault;
}

function earningsFrom(
  data: AppData,
  companyId: string,
  employeeId: string,
  excludeAdvanceId?: string,
): Earnings {
  const employee = data.employees.find(
    (e) => e.id === employeeId && e.companyId === companyId,
  );
  const settings = getSettings(companyId);
  const percent = employee?.percentage ?? settings.defaultAssemblerPercent;

  const orders = data.orders.filter(
    (o) =>
      o.companyId === companyId &&
      o.masterId === employeeId &&
      (o.status === "production" ||
        o.status === "installation" ||
        o.status === "closed"),
  );

  const orderEarnings = orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.number,
    amount: o.amount,
    earned: calcAssemblerEarnings(o.amount, percent),
  }));
  const totalEarned = orderEarnings.reduce((s, x) => s + x.earned, 0);
  const activeEarned = orders
    .filter((o) => ACTIVE_ORDER_STATUSES.has(o.status))
    .reduce((s, o) => s + calcAssemblerEarnings(o.amount, percent), 0);
  const advancesIssued = data.advances
    .filter(
      (a) =>
        a.companyId === companyId &&
        a.employeeId === employeeId &&
        a.status === "issued" &&
        a.id !== excludeAdvanceId,
    )
    .reduce((s, a) => s + a.amount, 0);
  const penaltiesTotal = data.penalties
    .filter(
      (p) =>
        p.companyId === companyId &&
        p.employeeId === employeeId &&
        p.status === "active",
    )
    .reduce((s, p) => s + p.amount, 0);

  return {
    employeeId,
    percent,
    orderEarnings,
    totalEarned,
    activeEarned,
    advancesIssued,
    penaltiesTotal,
    net: totalEarned - advancesIssued - penaltiesTotal,
  };
}

export function getEmployeeEarnings(companyId: string, employeeId: string): Earnings {
  return earningsFrom(getData(), companyId, employeeId);
}

/** Лимит аванса от выработки действует только для сдельной оплаты; у оклада его нет. */
export function hasAdvanceLimit(employee: Pick<Employee, "compensationType">): boolean {
  return (
    employee.compensationType === "percentage" ||
    employee.compensationType === "percentage_projects"
  );
}

export type AdvanceLimit = {
  limited: boolean;
  /** % лимита (личный или общий). */
  percent: number;
  /** Заработок по текущим заказам — база лимита. */
  totalEarned: number;
  advancesIssued: number;
  maxAllowed: number;
  available: number;
};

export function getAdvanceLimit(companyId: string, employeeId: string): AdvanceLimit {
  const data = getData();
  const employee = findEmployee(data, companyId, employeeId);
  const earnings = earningsFrom(data, companyId, employeeId);
  const percent = advancePercentFor(employee, getSettings(companyId).advanceMaxPercent);
  const { maxAllowed, available } = calcAvailableAdvance(
    earnings.activeEarned,
    earnings.advancesIssued,
    percent,
  );
  return {
    limited: hasAdvanceLimit(employee),
    percent,
    totalEarned: earnings.activeEarned,
    advancesIssued: earnings.advancesIssued,
    maxAllowed,
    available,
  };
}

/** Проверяет лимит и возвращает maxAllowed для записи (0 — без лимита). */
function checkAdvanceLimit(
  data: AppData,
  companyId: string,
  employeeId: string,
  amount: number,
  excludeAdvanceId?: string,
): number {
  const employee = findEmployee(data, companyId, employeeId);
  if (!hasAdvanceLimit(employee)) return 0;
  const earnings = earningsFrom(data, companyId, employeeId, excludeAdvanceId);
  const percent = advancePercentFor(employee, getSettings(companyId).advanceMaxPercent);
  const check = canIssueAdvance(earnings.activeEarned, earnings.advancesIssued, amount, percent);
  if (!check.ok) {
    if (amount > 0 && amount > check.available) {
      throw new PayrollError(
        `Превышен лимит аванса: максимум ${percent}% от заработка по текущим заказам ` +
          `(${money(earnings.activeEarned)}) минус выданные авансы (${money(earnings.advancesIssued)}). ` +
          `Можно выдать не больше ${money(check.available)}.`,
      );
    }
    throw new PayrollError(check.reason ?? "Нельзя выдать аванс");
  }
  return check.maxAllowed;
}

export type AdvanceInput = {
  employeeId: string;
  amount: number;
  date: string;
  comment: string;
  paymentMethod: PaymentMethod;
  orderId?: string | null;
};

function cleanComment(comment: string): string {
  const text = comment.trim();
  if (!text) throw new PayrollError("Укажите назначение аванса");
  return text;
}

function cleanAmount(amount: number): number {
  const value = Math.round(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new PayrollError("Сумма должна быть больше нуля");
  }
  return value;
}

export function createAdvance(
  companyId: string,
  input: AdvanceInput,
  actor: PayrollActor,
): Advance {
  const amount = cleanAmount(input.amount);
  const comment = cleanComment(input.comment);
  const advance = mutateDataLocked((data) => {
    const maxAllowed = checkAdvanceLimit(data, companyId, input.employeeId, amount);
    const created: Advance = {
      id: generateId("adv"),
      companyId,
      employeeId: input.employeeId,
      orderId: input.orderId ?? null,
      amount,
      maxAllowed,
      date: input.date.slice(0, 10),
      comment,
      authorId: actor.id,
      status: "issued",
      paymentMethod: input.paymentMethod,
      receipt: null,
    };
    data.advances.push(created);
    pushActivity(data, companyId, actor, `Выдал аванс. ${advanceDetails(data, created)}`, "advance", created.id);
    return created;
  });

  const emp = getData().employees.find((e) => e.id === input.employeeId);
  void createNotification({
    companyId,
    userId: null,
    type: "new_advance",
    title: "Аванс выдан",
    body: `${emp?.fullName ?? "Сотрудник"} — ${money(amount)}`,
    href: "/payroll",
  });

  return advance;
}

export function updateAdvance(
  companyId: string,
  id: string,
  input: AdvanceInput,
  actor: PayrollActor,
): Advance {
  const amount = cleanAmount(input.amount);
  const comment = cleanComment(input.comment);
  return mutateDataLocked((data) => {
    const advance = data.advances.find((a) => a.id === id && a.companyId === companyId);
    if (!advance) throw new PayrollError("Аванс не найден", 404);
    const maxAllowed =
      advance.status === "issued"
        ? checkAdvanceLimit(data, companyId, input.employeeId, amount, id)
        : advance.maxAllowed;
    const before = advanceDetails(data, advance);
    Object.assign(advance, {
      employeeId: input.employeeId,
      amount,
      maxAllowed,
      date: input.date.slice(0, 10),
      comment,
      paymentMethod: input.paymentMethod,
      ...(input.orderId !== undefined ? { orderId: input.orderId } : {}),
    });
    pushActivity(data, companyId, actor, `Изменил аванс. До: ${before}\nПосле: ${advanceDetails(data, advance)}`, "advance", id);
    return { ...advance };
  });
}

function removeReceiptFile(companyId: string, advanceId: string, receipt: MediaItem | null) {
  if (!receipt) return;
  const file = new URL(receipt.url, "http://local").searchParams.get("file");
  if (file) fs.rmSync(uploadPath(companyId, "advance", advanceId, file), { force: true });
}

export function deleteAdvance(companyId: string, id: string, actor: PayrollActor): void {
  mutateDataLocked((data) => {
    const advance = data.advances.find((a) => a.id === id && a.companyId === companyId);
    if (!advance) throw new PayrollError("Аванс не найден", 404);
    data.advances = data.advances.filter((a) => a.id !== id);
    pushActivity(data, companyId, actor, `Удалил аванс. ${advanceDetails(data, advance)}`, "advance", id);
  });
  fs.rmSync(uploadPath(companyId, "advance", id), { recursive: true, force: true });
}

export function getAdvance(companyId: string, id: string): Advance | null {
  return getData().advances.find((a) => a.id === id && a.companyId === companyId) ?? null;
}

/** Заменяет чек; прежний файл удаляется. */
export function setAdvanceReceipt(
  companyId: string,
  id: string,
  receipt: MediaItem | null,
  actor: PayrollActor,
): Advance {
  const { advance, previous } = mutateDataLocked((data) => {
    const found = data.advances.find((a) => a.id === id && a.companyId === companyId);
    if (!found) throw new PayrollError("Аванс не найден", 404);
    const before = found.receipt;
    found.receipt = receipt;
    pushActivity(
      data,
      companyId,
      actor,
      `${receipt ? "Прикрепил чек к авансу" : "Удалил чек аванса"}. ${advanceDetails(data, found)}`,
      "advance",
      id,
    );
    return { advance: { ...found }, previous: before };
  });
  if (previous && previous.id !== receipt?.id) {
    removeReceiptFile(companyId, id, previous);
  }
  return advance;
}

export type SalaryPaymentInput = {
  employeeId: string;
  amount: number;
  date: string;
  comment?: string | null;
};

export function createSalaryPayment(
  companyId: string,
  input: SalaryPaymentInput,
  actor: PayrollActor,
): SalaryPayment {
  const amount = cleanAmount(input.amount);
  return mutateDataLocked((data) => {
    findEmployee(data, companyId, input.employeeId);
    const now = nowIso();
    const payment: SalaryPayment = {
      id: generateId("salpay"),
      companyId,
      employeeId: input.employeeId,
      amount,
      date: input.date.slice(0, 10),
      comment: input.comment?.trim() || null,
      authorId: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    data.salaryPayments.push(payment);
    pushActivity(data, companyId, actor, `Выдал зарплату ${money(amount)}`, "salary_payment", payment.id);
    return payment;
  });
}

export function getSalaryPayment(companyId: string, id: string): SalaryPayment | null {
  return (
    getData().salaryPayments.find((p) => p.id === id && p.companyId === companyId) ?? null
  );
}

export function updateSalaryPayment(
  companyId: string,
  id: string,
  input: SalaryPaymentInput,
  actor: PayrollActor,
): SalaryPayment {
  const amount = cleanAmount(input.amount);
  return mutateDataLocked((data) => {
    const payment = data.salaryPayments.find((p) => p.id === id && p.companyId === companyId);
    if (!payment) throw new PayrollError("Выплата не найдена", 404);
    findEmployee(data, companyId, input.employeeId);
    Object.assign(payment, {
      employeeId: input.employeeId,
      amount,
      date: input.date.slice(0, 10),
      comment: input.comment?.trim() || null,
      updatedAt: nowIso(),
    });
    pushActivity(data, companyId, actor, `Изменил выплату зарплаты: ${money(amount)}`, "salary_payment", id);
    return { ...payment };
  });
}

export function deleteSalaryPayment(companyId: string, id: string, actor: PayrollActor): void {
  mutateDataLocked((data) => {
    const payment = data.salaryPayments.find((p) => p.id === id && p.companyId === companyId);
    if (!payment) throw new PayrollError("Выплата не найдена", 404);
    data.salaryPayments = data.salaryPayments.filter((p) => p.id !== id);
    pushActivity(data, companyId, actor, `Удалил выплату зарплаты ${money(payment.amount)}`, "salary_payment", id);
  });
}

export function createPenalty(input: {
  companyId: string;
  employeeId: string;
  reason: string;
  amount: number;
  comment?: string | null;
  authorId: string;
  auto?: boolean;
  date?: string;
}): Penalty {
  const penalty: Penalty = {
    id: generateId("pen"),
    companyId: input.companyId,
    employeeId: input.employeeId,
    reason: input.reason,
    amount: input.amount,
    date: input.date ?? todayDate(),
    comment: input.comment ?? null,
    authorId: input.authorId,
    status: "active",
    auto: input.auto ?? false,
  };
  mutateData((data) => {
    data.penalties.push(penalty);
  });
  return penalty;
}

/** Сколько должны мастерам (начисления минус авансы и штрафы). */
export function getAssemblerDebt(companyId: string): {
  totalDebt: number;
  masters: {
    employeeId: string;
    fullName: string;
    earned: number;
    advances: number;
    penalties: number;
    owed: number;
  }[];
} {
  const masters = getData().employees.filter(
    (e) =>
      e.companyId === companyId &&
      e.role === "MASTER" &&
      e.status !== "fired",
  );

  const rows = masters.map((m) => {
    const e = getEmployeeEarnings(companyId, m.id);
    return {
      employeeId: m.id,
      fullName: m.fullName,
      earned: e.totalEarned,
      advances: e.advancesIssued,
      penalties: e.penaltiesTotal,
      owed: Math.max(0, e.net),
    };
  });

  return {
    totalDebt: rows.reduce((s, r) => s + r.owed, 0),
    masters: rows.filter((r) => r.owed > 0 || r.earned > 0),
  };
}

export type OwnPayrollSummary = {
  totalEarned: number;
  advancesIssued: number;
  penaltiesTotal: number;
  paidOut: number;
  /** Что ещё причитается: заработано − авансы − штрафы − выплачено. */
  balance: number;
  /** Лимит аванса (только для сдельной оплаты). */
  advanceLimit?: { percent: number; available: number } | null;
};

/** Итог по своей зарплате для сотрудника без доступа к чужим выплатам. */
export function getOwnPayrollSummary(companyId: string, employeeId: string): OwnPayrollSummary {
  const e = getEmployeeEarnings(companyId, employeeId);
  const paidOut = getData()
    .salaryPayments.filter((p) => p.companyId === companyId && p.employeeId === employeeId)
    .reduce((s, p) => s + p.amount, 0);
  return {
    totalEarned: e.totalEarned,
    advancesIssued: e.advancesIssued,
    penaltiesTotal: e.penaltiesTotal,
    paidOut,
    balance: e.net - paidOut,
    advanceLimit: (() => {
      const l = getAdvanceLimit(companyId, employeeId);
      return l.limited ? { percent: l.percent, available: l.available } : null;
    })(),
  };
}
