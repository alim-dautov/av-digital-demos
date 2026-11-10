import { getData } from "@/lib/db";
import { todayDate } from "@/lib/utils";
import type {
  LeadSource,
  OrderStatus,
  ProductionStageKey,
} from "@/types";
import { ORDER_STATUS_LABELS, SOURCE_LABELS, STAGE_LABELS } from "@/types";
import { getLowStock, getStockSummary } from "@/lib/services/inventory";
import { getMastersWorkload } from "@/lib/services/employees";
import {
  getAssemblerDebt,
  listAdvances,
  listPenalties,
  listSalaries,
  listSalaryPayments,
  sumAmounts,
} from "@/lib/services/payroll";

export type AnalyticsPeriod = "today" | "week" | "month" | "quarter" | "year";

function startOfPeriod(period: AnalyticsPeriod, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  switch (period) {
    case "today":
      return d;
    case "week": {
      const day = d.getDay() || 7;
      d.setDate(d.getDate() - day + 1);
      return d;
    }
    case "month":
      d.setDate(1);
      return d;
    case "quarter": {
      const q = Math.floor(d.getMonth() / 3) * 3;
      d.setMonth(q, 1);
      return d;
    }
    case "year":
      d.setMonth(0, 1);
      return d;
  }
}

function previousPeriodRange(period: AnalyticsPeriod): {
  start: Date;
  end: Date;
} {
  const end = startOfPeriod(period);
  const start = new Date(end);
  switch (period) {
    case "today":
      start.setDate(start.getDate() - 1);
      break;
    case "week":
      start.setDate(start.getDate() - 7);
      break;
    case "month":
      start.setMonth(start.getMonth() - 1);
      break;
    case "quarter":
      start.setMonth(start.getMonth() - 3);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start, end };
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function ordersInRange(
  companyId: string,
  start: Date,
  endExclusive?: Date,
) {
  const startStr = isoDate(start);
  const endStr = endExclusive ? isoDate(endExclusive) : null;
  return getData().orders.filter((o) => {
    if (o.companyId !== companyId) return false;
    if (o.date < startStr) return false;
    if (endStr && o.date >= endStr) return false;
    return true;
  });
}

export function getDashboardKpis(companyId: string) {
  const data = getData();
  const orders = data.orders.filter((o) => o.companyId === companyId);
  const monthStart = startOfPeriod("month");
  const monthOrders = ordersInRange(companyId, monthStart);
  const prev = previousPeriodRange("month");
  const prevOrders = ordersInRange(companyId, prev.start, prev.end);

  const revenue = monthOrders.reduce((s, o) => s + o.amount, 0);
  const profit = monthOrders.reduce((s, o) => s + o.profit, 0);
  const prevRevenue = prevOrders.reduce((s, o) => s + o.amount, 0);
  const prevProfit = prevOrders.reduce((s, o) => s + o.profit, 0);

  const totalOrders = orders.length;
  const inProduction = orders.filter((o) => o.status === "production").length;
  const completed = orders.filter((o) => o.status === "closed").length;
  const prevTotal = prevOrders.length;
  const prevInProd = getData().orders.filter(
    (o) =>
      o.companyId === companyId &&
      o.status === "production" &&
      o.date >= isoDate(prev.start) &&
      o.date < isoDate(prev.end),
  ).length;
  const prevCompleted = prevOrders.filter((o) => o.status === "closed").length;

  return {
    totalOrders: {
      value: totalOrders,
      trend: trendPercent(monthOrders.length, prevTotal),
    },
    inProduction: {
      value: inProduction,
      trend: trendPercent(inProduction, prevInProd),
    },
    completed: {
      value: completed,
      trend: trendPercent(
        monthOrders.filter((o) => o.status === "closed").length,
        prevCompleted,
      ),
    },
    revenue: {
      value: revenue,
      trend: trendPercent(revenue, prevRevenue),
    },
    profit: {
      value: profit,
      trend: trendPercent(profit, prevProfit),
    },
  };
}

export function getOrdersTrend(
  companyId: string,
  period: AnalyticsPeriod,
): { label: string; orders: number; revenue: number; profit: number }[] {
  const start = startOfPeriod(period);
  const end = new Date();
  const points: { label: string; orders: number; revenue: number; profit: number }[] =
    [];

  const bucketCount =
    period === "today"
      ? 1
      : period === "week"
        ? 7
        : period === "month"
          ? 30
          : period === "quarter"
            ? 12
            : 12;

  if (period === "today" || period === "week" || period === "month") {
    const days = period === "today" ? 1 : period === "week" ? 7 : 30;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const key = isoDate(d);
      const dayOrders = getData().orders.filter(
        (o) => o.companyId === companyId && o.date === key,
      );
      points.push({
        label:
          period === "today"
            ? "Сегодня"
            : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }),
        orders: dayOrders.length,
        revenue: dayOrders.reduce((s, o) => s + o.amount, 0),
        profit: dayOrders.reduce((s, o) => s + o.profit, 0),
      });
    }
    return points;
  }

  // quarter / year → monthly buckets
  const months = period === "quarter" ? 3 : 12;
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const rangeOrders = ordersInRange(companyId, d, next);
    points.push({
      label: d.toLocaleDateString("ru-RU", { month: "short", year: "2-digit" }),
      orders: rangeOrders.length,
      revenue: rangeOrders.reduce((s, o) => s + o.amount, 0),
      profit: rangeOrders.reduce((s, o) => s + o.profit, 0),
    });
  }
  void start;
  void bucketCount;
  return points;
}

export function getStatusDistribution(companyId: string): {
  status: OrderStatus;
  label: string;
  count: number;
  percent: number;
}[] {
  const orders = getData().orders.filter((o) => o.companyId === companyId);
  const total = orders.length || 1;
  const statuses: OrderStatus[] = [
    "lead",
    "application",
    "contract",
    "approval",
    "production",
    "installation",
    "closed",
  ];
  return statuses.map((status) => {
    const count = orders.filter((o) => o.status === status).length;
    return {
      status,
      label: ORDER_STATUS_LABELS[status],
      count,
      percent: Math.round((count / total) * 100),
    };
  });
}

export function getProductionStagesSummary(companyId: string): {
  key: ProductionStageKey | "cutting_edging" | "painting_multicam";
  label: string;
  count: number;
}[] {
  const stages = getData().orderStages.filter(
    (s) =>
      s.companyId === companyId &&
      (s.status === "in_progress" || s.status === "pending"),
  );

  const countKey = (keys: ProductionStageKey[]) =>
    stages.filter(
      (s) => keys.includes(s.key) && s.status === "in_progress",
    ).length ||
    stages.filter((s) => keys.includes(s.key)).length;

  return [
    {
      key: "cutting_edging",
      label: "Распил с закаткой",
      count: countKey(["cutting", "edging"]),
    },
    {
      key: "drilling",
      label: STAGE_LABELS.drilling,
      count: countKey(["drilling"]),
    },
    {
      key: "assembly",
      label: STAGE_LABELS.assembly,
      count: countKey(["assembly"]),
    },
    {
      key: "painting_multicam",
      label: "Покраска / Мультикам",
      count: countKey(["painting", "multicam"]),
    },
    {
      key: "vacuum",
      label: STAGE_LABELS.vacuum,
      count: countKey(["vacuum"]),
    },
    {
      key: "installation",
      label: STAGE_LABELS.installation,
      count: countKey(["installation"]),
    },
  ];
}

export function getFinanceSummary(companyId: string) {
  const monthOrders = ordersInRange(companyId, startOfPeriod("month"));
  const revenue = monthOrders.reduce((s, o) => s + o.amount, 0);
  const cost = monthOrders.reduce((s, o) => s + o.cost, 0);
  const profit = monthOrders.reduce((s, o) => s + o.profit, 0);
  const salaries = listSalaries(companyId).reduce(
    (s, r) => s + r.netAmount,
    0,
  );
  const advances = listAdvances(companyId).reduce((s, a) => s + a.amount, 0);
  const materialsValue = getStockSummary(companyId).totalValue;
  const other = listPenalties(companyId).reduce((s, p) => s + p.amount, 0);
  const salaryPaidMonth = sumAmounts(
    listSalaryPayments(companyId, { from: todayDate().slice(0, 7) + "-01" }),
  );
  return {
    revenue,
    expenses: cost + salaries + advances + other,
    cost,
    salaries,
    salaryPaidMonth,
    advances,
    materials: materialsValue,
    other,
    profit,
    averageCheck:
      monthOrders.length > 0 ? Math.round(revenue / monthOrders.length) : 0,
    ordersCount: monthOrders.length,
  };
}

export function getLeadSources(companyId: string): {
  source: LeadSource;
  label: string;
  count: number;
  amount: number;
  percent: number;
}[] {
  const orders = getData().orders.filter((o) => o.companyId === companyId);
  const total = orders.length || 1;
  const sources = Object.keys(SOURCE_LABELS) as LeadSource[];
  return sources.map((source) => {
    const list = orders.filter((o) => o.source === source);
    return {
      source,
      label: SOURCE_LABELS[source],
      count: list.length,
      amount: list.reduce((s, o) => s + o.amount, 0),
      percent: Math.round((list.length / total) * 100),
    };
  });
}

export function getMastersAnalytics(companyId: string) {
  return getMastersWorkload(companyId);
}

export function getConversionMetrics(companyId: string) {
  const orders = getData().orders.filter((o) => o.companyId === companyId);
  const leads = orders.filter(
    (o) =>
      o.status === "lead" ||
      o.status === "application" ||
      o.status === "contract" ||
      o.status === "approval" ||
      o.status === "production" ||
      o.status === "installation" ||
      o.status === "closed",
  ).length;
  const closed = orders.filter((o) => o.status === "closed").length;
  const inFunnel = orders.filter((o) => o.status !== "closed").length;
  const conversionPercent =
    leads > 0 ? Math.round((closed / leads) * 1000) / 10 : 0;
  return {
    totalLeads: leads,
    closed,
    inFunnel,
    conversionPercent,
  };
}

export function getPeriodFinance(
  companyId: string,
  period: AnalyticsPeriod,
) {
  const periodOrders = ordersInRange(companyId, startOfPeriod(period));
  const revenue = periodOrders.reduce((s, o) => s + o.amount, 0);
  const profit = periodOrders.reduce((s, o) => s + o.profit, 0);
  const cost = periodOrders.reduce((s, o) => s + o.cost, 0);
  return {
    revenue,
    profit,
    cost,
    ordersCount: periodOrders.length,
    averageCheck:
      periodOrders.length > 0
        ? Math.round(revenue / periodOrders.length)
        : 0,
  };
}

export function getFullAnalytics(
  companyId: string,
  period: AnalyticsPeriod = "month",
) {
  return {
    kpis: getDashboardKpis(companyId),
    trend: getOrdersTrend(companyId, period),
    statusDistribution: getStatusDistribution(companyId),
    productionStages: getProductionStagesSummary(companyId),
    finance: getFinanceSummary(companyId),
    periodFinance: getPeriodFinance(companyId, period),
    conversion: getConversionMetrics(companyId),
    leadSources: getLeadSources(companyId),
    masters: getMastersAnalytics(companyId),
    lowStock: getLowStock(companyId),
    assemblerDebt: getAssemblerDebt(companyId),
    today: todayDate(),
    period,
  };
}
