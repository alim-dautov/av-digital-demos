import { getData } from "@/lib/db";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { sumExpenses } from "@/lib/services/order-expenses";
import type { AppData, Order, AtelierOrderStatus } from "@/types";

export type OrderProfitRow = {
  orderId: string;
  number: string;
  clientName: string;
  status: AtelierOrderStatus;
  date: string;
  /** Order amount after discount */
  revenue: number;
  /** Sum of all recorded expenses, any category */
  expenses: number;
  byCategory: Record<string, number>;
  netProfit: number;
  /** Net profit / revenue × 100, one decimal */
  marginPercent: number;
  /** Cost from the calculator, for reference */
  plannedCost: number;
  hasExpenses: boolean;
  /** Soft-deleted: kept in reports, but the card no longer opens */
  deleted: boolean;
};

export type ProfitTotals = {
  orders: number;
  revenue: number;
  expenses: number;
  netProfit: number;
  marginPercent: number;
  ordersWithoutExpenses: number;
  byCategory: Record<string, number>;
};

export type PeriodFilter = { from?: string | null; to?: string | null };

export function marginOf(revenue: number, profit: number): number {
  return revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
}

export function orderProfit(data: AppData, order: Order): OrderProfitRow {
  const expenses = data.orderExpenses.filter((e) => e.orderId === order.id);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
  const revenue = Number(order.amount) || 0;
  const total = sumExpenses(expenses);
  const netProfit = revenue - total;
  return {
    orderId: order.id,
    number: order.number,
    clientName:
      data.clients.find((c) => c.id === order.clientId)?.fullName ??
      order.atelierQuote?.clientName ??
      "Клиент не указан",
    status: order.status as AtelierOrderStatus,
    date: order.date,
    revenue,
    expenses: total,
    byCategory,
    netProfit,
    marginPercent: marginOf(revenue, netProfit),
    plannedCost: order.atelierQuote?.totalCost ?? order.cost ?? 0,
    hasExpenses: expenses.length > 0,
    deleted: !isActiveOrder(order),
  };
}

export function totalsOf(rows: OrderProfitRow[]): ProfitTotals {
  const totals: ProfitTotals = {
    orders: rows.length,
    revenue: 0,
    expenses: 0,
    netProfit: 0,
    marginPercent: 0,
    ordersWithoutExpenses: 0,
    byCategory: {},
  };
  for (const r of rows) {
    totals.revenue += r.revenue;
    totals.expenses += r.expenses;
    totals.netProfit += r.netProfit;
    if (!r.hasExpenses) totals.ordersWithoutExpenses += 1;
    for (const [k, v] of Object.entries(r.byCategory)) {
      totals.byCategory[k] = (totals.byCategory[k] ?? 0) + v;
    }
  }
  totals.marginPercent = marginOf(totals.revenue, totals.netProfit);
  return totals;
}

export const PERIOD_PRESETS = {
  month: "Этот месяц",
  quarter: "Квартал",
  year: "Год",
  all: "Всё время",
  custom: "Период",
} as const;

export type PeriodPreset = keyof typeof PERIOD_PRESETS;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function almatyToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(now);
}

/** Resolves a preset (or custom from/to) into an inclusive YYYY-MM-DD range. */
export function resolvePeriod(
  preset: string | undefined,
  from?: string,
  to?: string,
  now: Date = new Date(),
): { preset: PeriodPreset; from: string | null; to: string | null } {
  const today = almatyToday(now);
  const [y, m] = today.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const monthEnd = (month: number) =>
    `${y}-${pad(month)}-${pad(new Date(Date.UTC(y, month, 0)).getUTCDate())}`;
  switch (preset) {
    case "quarter": {
      const startMonth = Math.floor((m - 1) / 3) * 3 + 1;
      return { preset: "quarter", from: `${y}-${pad(startMonth)}-01`, to: monthEnd(startMonth + 2) };
    }
    case "year":
      return { preset: "year", from: `${y}-01-01`, to: `${y}-12-31` };
    case "all":
      return { preset: "all", from: null, to: null };
    case "custom": {
      const f = from && DAY.test(from) ? from : null;
      const t = to && DAY.test(to) ? to : null;
      if (f && t && f > t) return { preset: "custom", from: t, to: f };
      return { preset: "custom", from: f, to: t };
    }
    default:
      return { preset: "month", from: `${y}-${pad(m)}-01`, to: monthEnd(m) };
  }
}

function inPeriod(date: string, period: PeriodFilter): boolean {
  const day = date.slice(0, 10);
  if (period.from && day < period.from) return false;
  if (period.to && day > period.to) return false;
  return true;
}

/** Sold orders: everything except drafts, measurements and cancelled ones, filtered by order date. */
export function getAtelierProfit(
  companyId: string,
  period: PeriodFilter = {},
  data: AppData = getData(),
): { rows: OrderProfitRow[]; totals: ProfitTotals } {
  const rows = data.orders
    .filter(
      (o) =>
        o.companyId === companyId &&
        o.status !== "cancelled" &&
        o.status !== "draft" &&
        o.status !== "measurement" &&
        inPeriod(o.date, period),
    )
    .map((o) => orderProfit(data, o))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  return { rows, totals: totalsOf(rows) };
}

export function getOrderProfit(companyId: string, orderIdOrNumber: string): OrderProfitRow | null {
  const data = getData();
  const order = data.orders.find(
    (o) => o.companyId === companyId && (o.id === orderIdOrNumber || o.number === orderIdOrNumber),
  );
  return order ? orderProfit(data, order) : null;
}

/** Orders that can be opened in the costing section: everything except cancelled. */
export function listCostingOrders(companyId: string) {
  const data = getData();
  return data.orders
    .filter((o) => o.companyId === companyId && isActiveOrder(o) && o.status !== "cancelled")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((o) => orderProfit(data, o));
}
