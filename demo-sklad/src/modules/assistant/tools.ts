import "server-only";
import { z } from "zod";
import type { DB } from "@/db";
import { assertCan, type ModuleKey, type Principal } from "@/lib/rbac";
import { addDays, today } from "@/lib/format";
import { listProducts, quickSearch, visiblePriceTypes } from "@/modules/products/service";
import { debtSummary, getCounterparty, listCounterparties } from "@/modules/counterparties/service";
import { getOrder, listOrders } from "@/modules/orders/service";
import { board as taskBoard, createTask } from "@/modules/tasks/service";
import { createLead } from "@/modules/leads/service";
import { kpis } from "@/modules/analytics/service";

/**
 * Типизированные инструменты для ИИ-ассистента и MCP-сервера.
 * Каждый вызов идёт через те же сервисы, что и UI, поэтому права (модули, закупка, маржа) соблюдаются автоматически.
 * Деньги — в тиынах (1 ₸ = 100 тиын), поле *_kzt дублирует сумму в тенге для удобства модели.
 */
export type Tool<S extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  module: ModuleKey;
  write?: boolean;
  input: S;
  run: (db: DB, p: Principal, input: z.infer<S>) => Promise<unknown>;
};
const tool = <S extends z.ZodType>(t: Tool<S>) => t;
const kzt = (tiyn: number) => Math.round(tiyn) / 100;
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");

async function namedPrices(db: DB, p: Principal) {
  const types = await visiblePriceTypes(db, p);
  return (prices: Record<number, number>) => Object.fromEntries(types.filter((t) => prices[t.id] != null).map((t) => [t.name, kzt(prices[t.id])]));
}

export const TOOLS = [
  tool({
    name: "search_products", title: "Поиск товаров", module: "products",
    description: "Найти товары по названию, артикулу или штрихкоду. Возвращает остаток и цены (в тенге) по доступным типам цен.",
    input: z.object({ query: z.string().min(1).describe("Что искать, например «ввг 3х2,5» или «перфоратор»"), limit: z.number().int().min(1).max(50).default(10) }),
    run: async (db, p, i) => {
      const fmt = await namedPrices(db, p);
      return (await quickSearch(db, p, i.query, i.limit)).map((r) => ({ id: r.id, name: r.name, sku: r.sku, unit: r.unit, stock: r.stock, prices_kzt: fmt(r.prices) }));
    },
  }),
  tool({
    name: "low_stock", title: "Товары ниже минимума", module: "stock",
    description: "Товары, остаток которых меньше минимального — что пора заказать.",
    input: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
    run: async (db, p, i) => {
      assertCan(p, "stock");
      const r = await listProducts(db, p, { lowStock: true, active: true, pageSize: i.limit });
      return r.rows.map((x) => ({ id: x.id, name: x.name, unit: x.unit, stock: x.stock, minStock: Number(x.minStock) }));
    },
  }),
  tool({
    name: "find_clients", title: "Поиск контрагентов", module: "counterparties",
    description: "Найти клиента или поставщика по названию или телефону. Возвращает долг клиента (в тенге).",
    input: z.object({ query: z.string().min(1), kind: z.enum(["client", "supplier", "all"]).default("all") }),
    run: async (db, p, i) => {
      const r = await listCounterparties(db, p, { q: i.query, kind: i.kind === "all" ? undefined : i.kind, pageSize: 20 });
      return r.rows.map((c) => ({ id: c.id, name: c.name, phone: c.phone, kind: c.kind, debt_kzt: kzt(c.clientDebt ?? 0) }));
    },
  }),
  tool({
    name: "get_client", title: "Карточка контрагента", module: "counterparties",
    description: "Подробности контрагента: контакты, сегмент, лимит и текущий долг.",
    input: z.object({ id: z.number().int() }),
    run: async (db, p, i) => getCounterparty(db, p, i.id),
  }),
  tool({
    name: "debts", title: "Дебиторка и кредиторка", module: "payments",
    description: "Кто нам должен (с днями просрочки) и кому должны мы. Суммы в тенге.",
    input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    run: async (db, p, i) => {
      const d = await debtSummary(db, p);
      return {
        owed_to_us_kzt: kzt(d.owedToUs), we_owe_kzt: kzt(d.weOwe),
        debtors: d.debtors.slice(0, i.limit).map((r) => ({ id: r.id, name: r.name, debt_kzt: kzt(r.client_debt), overdue_days: r.overdueDays, manager: r.manager })),
        creditors: d.creditors.slice(0, i.limit).map((r) => ({ id: r.id, name: r.name, debt_kzt: kzt(r.our_debt) })),
      };
    },
  }),
  tool({
    name: "list_orders", title: "Заявки", module: "orders",
    description: "Список заявок за период с фильтром по клиенту или тексту. По умолчанию — последние 7 дней.",
    input: z.object({ query: z.string().optional(), counterpartyId: z.number().int().optional(), from: date.optional(), to: date.optional(), limit: z.number().int().min(1).max(100).default(30) }),
    run: async (db, p, i) => {
      const r = await listOrders(db, p, { q: i.query, counterpartyId: i.counterpartyId, from: i.from ?? addDays(today(), -7), to: i.to ?? today(), pageSize: i.limit });
      return { total: r.total, rows: r.rows };
    },
  }),
  tool({
    name: "get_order", title: "Заявка", module: "orders",
    description: "Заявка с позициями, статусом и клиентом.",
    input: z.object({ id: z.number().int() }),
    run: async (db, p, i) => getOrder(db, p, i.id),
  }),
  tool({
    name: "my_tasks", title: "Мои задачи", module: "tasks",
    description: "Открытые задачи текущего пользователя по этапам.",
    input: z.object({}),
    run: async (db, p) => {
      const b = await taskBoard(db, p, { mine: true });
      const stage = new Map(b.stages.map((s) => [s.id, s.name]));
      return { tasks: b.tasks.filter((t) => !t.completedAt).map((t) => ({ id: t.id, title: t.title, stage: stage.get(t.stageId), dueAt: t.dueAt, priority: t.priority })) };
    },
  }),
  tool({
    name: "create_task", title: "Создать задачу", module: "tasks", write: true,
    description: "Поставить задачу. Если ответственный не указан — на себя. Срок — ISO дата-время.",
    input: z.object({ title: z.string().min(1).max(300), description: z.string().max(5000).default(""), assigneeId: z.number().int().optional(), dueAt: z.string().optional(), priority: z.enum(["low", "normal", "high", "urgent"]).default("normal") }),
    run: async (db, p, i) => {
      assertCan(p, "tasks", "full");
      return createTask(db, p, { title: i.title, description: i.description, assigneeId: i.assigneeId ?? p.id, dueAt: i.dueAt ?? null, priority: i.priority, tags: [], attachments: [] });
    },
  }),
  tool({
    name: "create_lead", title: "Создать лид", module: "pipeline", write: true,
    description: "Добавить лид в воронку продаж. Сумма — в тенге.",
    input: z.object({ title: z.string().min(1).max(300), contactName: z.string().max(200).default(""), phone: z.string().max(40).optional(), amount_kzt: z.number().min(0).default(0), source: z.string().max(100).default("ассистент"), comment: z.string().max(5000).default("") }),
    run: async (db, p, i) => {
      assertCan(p, "pipeline", "full");
      return createLead(db, p, { title: i.title, contactName: i.contactName, phone: i.phone ?? null, amount: Math.round(i.amount_kzt * 100), source: i.source, comment: i.comment, segment: "other", managerId: p.isSalesManager ? p.id : null });
    },
  }),
  tool({
    name: "sales_summary", title: "Сводка продаж", module: "analytics",
    description: "Выручка, прибыль (если есть право), число заявок, средний чек и конверсия лидов за период. Суммы в тенге.",
    input: z.object({ from: date.optional(), to: date.optional() }),
    run: async (db, p, i) => {
      const k = await kpis(db, p, i.from ?? addDays(today(), -29), i.to ?? today());
      return { revenue_kzt: kzt(k.revenue), profit_kzt: k.profit == null ? null : kzt(k.profit), margin_pct: k.marginPct, orders: k.orders, orders_sum_kzt: kzt(k.ordersSum), avg_check_kzt: kzt(k.avgCheck), lead_conversion_pct: Math.round(k.conversionPct * 10) / 10 };
    },
  }),
] as const satisfies readonly Tool[];

export type ToolName = (typeof TOOLS)[number]["name"];

/** Инструменты, доступные субъекту (по правам модулей; запись — только при полном доступе) */
export function toolsFor(p: Principal) {
  return (TOOLS as readonly Tool[]).filter((t) => { try { assertCan(p, t.module, t.write ? "full" : "view"); return true; } catch { return false; } });
}

export async function runTool(db: DB, p: Principal, name: string, args: unknown) {
  const t = (TOOLS as readonly Tool[]).find((x) => x.name === name);
  if (!t) throw Object.assign(new Error(`Неизвестный инструмент: ${name}`), { status: 404 });
  assertCan(p, t.module, t.write ? "full" : "view");
  const parsed = t.input.safeParse(args ?? {});
  if (!parsed.success) throw Object.assign(new Error(parsed.error.issues.map((x) => `${x.path.join(".")}: ${x.message}`).join("; ")), { status: 400 });
  return t.run(db, p, parsed.data);
}

export const toolJsonSchema = (t: Tool) => z.toJSONSchema(t.input, { target: "draft-7" }) as Record<string, unknown>;
