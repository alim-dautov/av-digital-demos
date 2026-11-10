import "server-only";
import type { DB } from "@/db";
import type { Principal } from "@/lib/rbac";
import { money, num } from "@/lib/format";
import { runTool, toolsFor, type Tool } from "./tools";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ToolCall = { name: string; title: string; args: unknown; ok: boolean; result?: unknown; error?: string };
export type AssistantReply = { text: string; toolCalls: ToolCall[] };

/**
 * ИИ-ассистент — заглушка с готовым интерфейсом.
 * Реальную модель (например Claude через @anthropic-ai/sdk с tool use) подключают реализацией AssistantProvider:
 * описание инструментов берётся из toolsFor(p) + toolJsonSchema(t), вызовы — через runTool(db, p, name, args).
 */
export interface AssistantProvider {
  readonly name: string;
  readonly isStub: boolean;
  reply(db: DB, p: Principal, history: ChatMessage[]): Promise<AssistantReply>;
}

type Intent = { re: RegExp; tool: string; args: (text: string) => unknown };
const strip = (t: string, re: RegExp) => t.replace(re, " ").replace(/[?!.,]+$/g, "").replace(/\s+/g, " ").trim();
const INTENTS: Intent[] = [
  { re: /(ниже минимум|заканчива|что заказать|дозаказ)/i, tool: "low_stock", args: () => ({}) },
  { re: /(долг|долж|дебитор|кредитор)/i, tool: "debts", args: () => ({ limit: 10 }) },
  { re: /(мои задачи|задачи на сегодня|что мне сделать)/i, tool: "my_tasks", args: () => ({}) },
  { re: /(продаж|выручк|сводк|прибыл)/i, tool: "sales_summary", args: () => ({}) },
  { re: /(заявк)/i, tool: "list_orders", args: () => ({ limit: 10 }) },
  { re: /(клиент|контрагент|поставщик)\s+/i, tool: "find_clients", args: (t) => ({ query: strip(t, /(найди|покажи|клиент[аы]?|контрагент[аы]?|поставщик[аи]?)/gi) || t }) },
  { re: /(остат|налич|сколько стоит|цена|цену|прайс|есть ли|найди)/i, tool: "search_products", args: (t) => ({ query: strip(t, /(какой|какая|какие|сколько|стоит|остаток|остатки|наличие|в наличии|цена|цену|есть ли|найди|покажи|по|на|у нас|товар[аы]?)/gi) || t, limit: 8 }) },
];

function describe(name: string, r: unknown): string {
  const x = r as Record<string, unknown>;
  switch (name) {
    case "search_products": {
      const rows = r as { name: string; unit: string; stock: number; prices_kzt: Record<string, number> }[];
      if (!rows.length) return "Не нашёл таких товаров. Попробуйте другое написание или артикул.";
      return rows.map((p) => `• ${p.name} — остаток ${num(p.stock)} ${p.unit}; ${Object.entries(p.prices_kzt).map(([k, v]) => `${k}: ${money(v * 100)}`).join(", ")}`).join("\n");
    }
    case "low_stock": {
      const rows = r as { name: string; unit: string; stock: number; minStock: number }[];
      return rows.length ? `Ниже минимума ${rows.length} поз.:\n` + rows.slice(0, 15).map((p) => `• ${p.name}: ${num(p.stock)} из ${num(p.minStock)} ${p.unit}`).join("\n") : "Все товары выше минимального остатка.";
    }
    case "debts": {
      const d = x as { owed_to_us_kzt: number; we_owe_kzt: number; debtors: { name: string; debt_kzt: number; overdue_days: number }[] };
      return `Нам должны ${money(d.owed_to_us_kzt * 100)}, мы должны ${money(d.we_owe_kzt * 100)}.\n` + d.debtors.slice(0, 8).map((c) => `• ${c.name}: ${money(c.debt_kzt * 100)}${c.overdue_days ? `, просрочка ${c.overdue_days} дн.` : ""}`).join("\n");
    }
    case "sales_summary": {
      const s = x as { revenue_kzt: number; profit_kzt: number | null; orders: number; avg_check_kzt: number; lead_conversion_pct: number };
      return `За 30 дней: выручка ${money(s.revenue_kzt * 100)}${s.profit_kzt != null ? `, прибыль ${money(s.profit_kzt * 100)}` : ""}, заявок ${s.orders}, средний чек ${money(s.avg_check_kzt * 100)}, конверсия лидов ${s.lead_conversion_pct}%.`;
    }
    case "find_clients": {
      const rows = r as { name: string; phone: string | null; debt_kzt: number }[];
      return rows.length ? rows.map((c) => `• ${c.name}${c.phone ? `, ${c.phone}` : ""}${c.debt_kzt > 0 ? ` — долг ${money(c.debt_kzt * 100)}` : ""}`).join("\n") : "Контрагент не найден.";
    }
    case "list_orders": {
      const o = x as { total: number; rows: { number: number; counterpartyName: string; total: number; statusName: string }[] };
      return `Заявок за 7 дней: ${o.total}.\n` + o.rows.slice(0, 10).map((r) => `• №${r.number} ${r.counterpartyName} — ${money(r.total)} (${r.statusName})`).join("\n");
    }
    case "my_tasks": {
      const t = (x as { tasks: { title: string; stage?: string }[] }).tasks;
      return t.length ? `Ваших открытых задач: ${t.length}.\n` + t.slice(0, 10).map((k) => `• ${k.title}${k.stage ? ` (${k.stage})` : ""}`).join("\n") : "Открытых задач нет.";
    }
    default: return "Готово.";
  }
}

/** Заглушка: распознаёт простые запросы по ключевым словам и вызывает настоящие инструменты */
class StubProvider implements AssistantProvider {
  readonly name = "Локальный помощник (заглушка)";
  readonly isStub = true;
  async reply(db: DB, p: Principal, history: ChatMessage[]): Promise<AssistantReply> {
    const text = history.filter((m) => m.role === "user").at(-1)?.content.trim() ?? "";
    const allowed = new Set(toolsFor(p).map((t) => t.name));
    const intent = INTENTS.find((i) => i.re.test(text) && allowed.has(i.tool));
    if (!intent) {
      return { toolCalls: [], text: "Я пока работаю в режиме заглушки и понимаю простые запросы:\n• «остаток ввг 3х2,5», «сколько стоит перфоратор»\n• «кто нам должен»\n• «что ниже минимума»\n• «сводка продаж»\n• «мои задачи», «заявки»\n\nПолноценный ИИ подключается реализацией AssistantProvider (см. src/modules/assistant/provider.ts)." };
    }
    const args = intent.args(text);
    const t = toolsFor(p).find((x) => x.name === intent.tool) as Tool;
    try {
      const result = await runTool(db, p, intent.tool, args);
      return { text: describe(intent.tool, result), toolCalls: [{ name: t.name, title: t.title, args, ok: true, result }] };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { text: `Не получилось: ${error}`, toolCalls: [{ name: t.name, title: t.title, args, ok: false, error }] };
    }
  }
}

let instance: AssistantProvider | null = null;
export function getAssistant(): AssistantProvider {
  if (instance) return instance;
  switch (process.env.ASSISTANT_PROVIDER) {
    // case "claude": instance = new ClaudeAssistant(); break;
    default: instance = new StubProvider();
  }
  return instance;
}
