import { getData } from "@/lib/db";
import type { LeadSource, AtelierOrderStatus } from "@/types";
import { ATELIER_ORDER_STATUS_LABELS, SOURCE_LABELS } from "@/types";

export type AnalyticsPeriod = "day" | "week" | "month";

function startOf(period: AnalyticsPeriod): string {
  const now = new Date();
  if (period === "day") return now.toISOString().slice(0, 10);
  if (period === "week") {
    const date = new Date(now);
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return date.toISOString().slice(0, 10);
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function getAtelierAnalytics(companyId: string, period: AnalyticsPeriod) {
  const from = startOf(period);
  const data = getData();
  const orders = data.orders.filter((order) => order.companyId === companyId && order.date >= from);
  const clients = data.clients.filter((client) => client.companyId === companyId);
  const sum = orders.reduce((total, order) => total + order.amount, 0);
  const statuses = (Object.keys(ATELIER_ORDER_STATUS_LABELS) as AtelierOrderStatus[]).map((status) => {
    const list = orders.filter((order) => order.status === status);
    return {
      status,
      label: ATELIER_ORDER_STATUS_LABELS[status],
      count: list.length,
      amount: list.reduce((total, order) => total + order.amount, 0),
    };
  });

  const sourceKeys = new Map<string, { label: string; clients: number; orders: number; amount: number }>();
  const ensure = (key: string, label: string) => {
    if (!sourceKeys.has(key)) sourceKeys.set(key, { label, clients: 0, orders: 0, amount: 0 });
    return sourceKeys.get(key)!;
  };
  for (const source of Object.keys(SOURCE_LABELS) as LeadSource[]) {
    ensure(source, SOURCE_LABELS[source]);
  }
  for (const client of clients) {
    const note = client.source === "other" ? client.sourceNote?.trim() : "";
    const key = note ? `other:${note}` : client.source;
    const label = note ? note : SOURCE_LABELS[client.source] ?? client.source;
    ensure(key, label).clients += 1;
  }
  for (const order of data.orders.filter((item) => item.companyId === companyId)) {
    const note = order.source === "other" ? order.sourceNote?.trim() : "";
    const key = note ? `other:${note}` : order.source;
    const label = note ? note : SOURCE_LABELS[order.source as LeadSource] ?? order.source;
    const bucket = ensure(key, label);
    bucket.orders += 1;
    bucket.amount += order.amount;
  }

  return {
    period,
    from,
    ordersCount: orders.length,
    ordersSum: sum,
    averageCheck: orders.length ? Math.round(sum / orders.length) : 0,
    statuses: statuses.filter((row) => row.count > 0 || ATELIER_ORDER_STATUS_LABELS[row.status]),
    sources: [...sourceKeys.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .filter((row) => row.clients || row.orders)
      .sort((a, b) => b.amount - a.amount),
  };
}
