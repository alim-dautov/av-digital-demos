import type { PaySchemeComponents as C } from "@/modules/payroll/types";

const bpIn = (bp: number) => String(bp / 100).replace(".", ",");

/** Короткое описание схемы для таблицы */
export function schemeSummary(c: C | null) {
  if (!c) return "не задана";
  const parts: string[] = [];
  const m = (t: number) => `${Math.round(t / 100).toLocaleString("ru-RU")} ₸`;
  if (c.salary) parts.push(`оклад ${m(c.salary.amount)}`);
  if (c.salesPercent) parts.push(`${c.salesPercent.tiers.map((t) => bpIn(t.rateBp) + "%").join("/")} с ${c.salesPercent.basis === "profit" ? "прибыли" : "продаж"}`);
  if (c.piecework) parts.push(`сдельно ${m(c.piecework.rate)}/${{ order: "заявка", item: "позиция", unit: "ед." }[c.piecework.per]}`);
  if (c.kpiBonus?.planThresholds.length || c.kpiBonus?.tasksOnTime) parts.push("KPI-бонусы");
  return parts.join(" + ") || "пустая";
}
