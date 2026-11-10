import type { DB } from "@/db";
import { flag, type Principal } from "@/lib/rbac";
import { fmtDate, money, num, pct } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/labels";
import { abc, bySegment, managersVsPlan, marginBy, profitReport, taskPerformance } from "./service";

export type ReportKey = "sales" | "margin" | "segments" | "managers" | "abc" | "tasks";
export type Dim = "client" | "product" | "folder" | "shipment" | "manager";
export const DIMS: Record<Dim, string> = { client: "по клиентам", product: "по товарам", folder: "по папкам", shipment: "по отгрузкам", manager: "по менеджерам" };
type Cell = string | number | null;
export type Report = { title: string; cols: { title: string; money?: boolean; right?: boolean }[]; rows: Cell[][]; foot?: Cell[] };

/** Табличное представление отчёта для экспорта (Excel/PDF). Деньги — в тиынах. */
export async function buildReport(db: DB, p: Principal, key: ReportKey, from: string, to: string, dim: Dim = "client"): Promise<Report> {
  const profit = flag(p, "seeProfit");
  switch (key) {
    case "sales": {
      const r = await profitReport(db, p, from, to, "day");
      return {
        title: "Продажи по дням",
        cols: [{ title: "Дата" }, { title: "Отгрузок", right: true }, { title: "Выручка", money: true }, ...(profit ? [{ title: "Себестоимость", money: true }, { title: "Прибыль", money: true }] : [])],
        rows: r.series.filter((x) => x.revenue || x.shipments).map((x) => [fmtDate(x.d), x.shipments, x.revenue, ...(profit ? [x.cost, x.profit] : [])]),
        foot: ["Итого", r.series.reduce((s, x) => s + x.shipments, 0), r.revenue, ...(profit ? [r.cost, r.profit] : [])],
      };
    }
    case "margin": {
      const rows = await marginBy(db, p, dim, from, to, 500);
      return {
        title: `Маржинальность ${DIMS[dim]}`,
        cols: [{ title: "Наименование" }, { title: "Выручка", money: true }, ...(profit ? [{ title: "Себестоимость", money: true }, { title: "Прибыль", money: true }, { title: "Маржа", right: true }] : [])],
        rows: rows.map((r) => [r.name + (r.estimated ? " *" : ""), r.revenue, ...(profit ? [r.cost, r.profit, r.marginPct == null ? null : pct(r.marginPct)] : [])]),
      };
    }
    case "segments": {
      const rows = await bySegment(db, p, from, to);
      return { title: "Продажи по сегментам", cols: [{ title: "Сегмент" }, { title: "Отгрузок", right: true }, { title: "Выручка", money: true }, ...(profit ? [{ title: "Прибыль", money: true }] : [])],
        rows: rows.map((r) => [SEGMENT_LABELS[r.segment as keyof typeof SEGMENT_LABELS] ?? r.segment, r.orders, r.revenue, ...(profit ? [r.profit] : [])]) };
    }
    case "managers": {
      const m = await managersVsPlan(db, p, to);
      return { title: `Менеджеры и план недели ${fmtDate(m.start)}–${fmtDate(m.end)}`, cols: [{ title: "Менеджер" }, { title: "Заявок", right: true }, { title: "Выручка", money: true }, { title: "План", money: true }, { title: "Выполнение", right: true }],
        rows: m.rows.map((r) => [r.name, r.orders, r.revenue, r.plan, r.plan ? pct(r.pct) : "—"]) };
    }
    case "abc": {
      const r = await abc(db, p, from, to);
      return { title: "ABC-анализ по выручке", cols: [{ title: "Группа" }, { title: "Товар" }, { title: "Выручка", money: true }, { title: "Доля", right: true }, { title: "Накопительно", right: true }],
        rows: r.rows.map((x) => [x.group, x.name, x.revenue, pct(x.sharePct), pct(x.cumulativePct)]) };
    }
    case "tasks": {
      const rows = await taskPerformance(db, p, from, to);
      return { title: "Выполнение задач", cols: [{ title: "Сотрудник" }, { title: "В работе", right: true }, { title: "Просрочено", right: true }, { title: "Выполнено", right: true }, { title: "В срок", right: true }, { title: "Среднее время, ч", right: true }],
        rows: rows.map((r) => [r.name, r.open, r.overdue, r.done, r.onTimePct == null ? "—" : pct(r.onTimePct), Math.round(r.avgHours)]) };
    }
  }
}

/** Ячейки для PDF: деньги форматируются, числа — с разрядами */
export function formatReport(r: Report) {
  const f = (v: Cell, i: number) => (v == null ? "—" : r.cols[i]?.money && typeof v === "number" ? money(v) : typeof v === "number" ? num(v) : v);
  return { cols: r.cols.map((c) => ({ title: c.title, right: c.money || c.right })), rows: r.rows.map((row) => row.map(f)), foot: r.foot?.map((v, i) => (v == null ? "" : f(v, i))) };
}
