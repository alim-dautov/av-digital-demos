import "server-only";
import { z } from "zod";
import type { DB } from "@/db";
import { assertCan, type ModuleKey, type Principal } from "@/lib/rbac";
import { addDays, today } from "@/lib/format";
import * as products from "@/modules/products/service";
import * as cps from "@/modules/counterparties/service";
import * as orders from "@/modules/orders/service";
import * as shipments from "@/modules/shipments/service";
import * as receipts from "@/modules/receipts/service";
import * as finance from "@/modules/finance/service";
import * as tasks from "@/modules/tasks/service";
import * as leads from "@/modules/leads/service";
import { kpis, stockReport } from "@/modules/analytics/service";

/**
 * REST API v1. Одна таблица маршрутов — и для обработчика, и для OpenAPI.
 * Деньги — целые тиыны (1 ₸ = 100). Даты — ГГГГ-ММ-ДД, часовой пояс Asia/Almaty.
 */
type Ctx = { db: DB; p: Principal; params: Record<string, string>; query: Record<string, unknown>; body: unknown };
export type ApiRoute = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string; // /orders/{id}
  summary: string;
  tag: string;
  module: ModuleKey;
  write?: boolean;
  query?: z.ZodObject;
  body?: z.ZodType;
  handler: (c: Ctx) => Promise<unknown>;
};

const int = z.coerce.number().int();
const page = { page: int.min(1).optional(), pageSize: int.min(1).max(200).optional() };
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const id = (c: Ctx) => Number(c.params.id);
const r = (x: ApiRoute) => x;

export const API_ROUTES: ApiRoute[] = [
  /* Товары */
  r({ method: "GET", path: "/products", tag: "Товары", module: "products", summary: "Список товаров с остатком и ценами (закупка — только с правом seePurchase)",
    query: z.object({ q: z.string().optional(), folderId: int.optional(), lowStock: z.coerce.boolean().optional(), ...page }),
    handler: (c) => products.listProducts(c.db, c.p, c.query as products.ProductListParams) }),
  r({ method: "GET", path: "/products/{id}", tag: "Товары", module: "products", summary: "Карточка товара", handler: (c) => products.getProduct(c.db, c.p, id(c)) }),
  r({ method: "POST", path: "/products", tag: "Товары", module: "products", write: true, summary: "Создать товар", body: products.productInput, handler: (c) => products.createProduct(c.db, c.p, c.body as products.ProductInput) }),
  r({ method: "PUT", path: "/products/{id}", tag: "Товары", module: "products", write: true, summary: "Изменить товар", body: products.productInput, handler: (c) => products.updateProduct(c.db, c.p, id(c), c.body as products.ProductInput) }),
  r({ method: "GET", path: "/price-types", tag: "Товары", module: "products", summary: "Типы цен, доступные токену", handler: (c) => products.visiblePriceTypes(c.db, c.p) }),
  r({ method: "GET", path: "/folders", tag: "Товары", module: "products", summary: "Папки каталога", handler: (c) => products.listFolders(c.db) }),
  r({ method: "GET", path: "/stock", tag: "Склад", module: "stock", summary: "Остатки (вкладки: all, instock, negative, low)",
    query: z.object({ q: z.string().optional(), tab: z.enum(["all", "instock", "negative", "low"]).optional(), page: int.min(1).optional() }),
    handler: (c) => stockReport(c.db, c.p, c.query as never) }),

  /* Контрагенты */
  r({ method: "GET", path: "/counterparties", tag: "Контрагенты", module: "counterparties", summary: "Клиенты и поставщики с балансами",
    query: z.object({ q: z.string().optional(), kind: z.enum(["client", "supplier"]).optional(), debtors: z.coerce.boolean().optional(), ...page }),
    handler: (c) => cps.listCounterparties(c.db, c.p, c.query as cps.CpListParams) }),
  r({ method: "GET", path: "/counterparties/{id}", tag: "Контрагенты", module: "counterparties", summary: "Карточка контрагента", handler: (c) => cps.getCounterparty(c.db, c.p, id(c)) }),
  r({ method: "POST", path: "/counterparties", tag: "Контрагенты", module: "counterparties", write: true, summary: "Создать контрагента", body: cps.counterpartyInput, handler: (c) => cps.createCounterparty(c.db, c.p, c.body as cps.CounterpartyInput) }),
  r({ method: "GET", path: "/debts", tag: "Контрагенты", module: "payments", summary: "Дебиторская и кредиторская задолженность", handler: (c) => cps.debtSummary(c.db, c.p) }),

  /* Заявки */
  r({ method: "GET", path: "/orders", tag: "Заявки", module: "orders", summary: "Список заявок",
    query: z.object({ q: z.string().optional(), statusId: int.optional(), counterpartyId: int.optional(), from: day.optional(), to: day.optional(), ...page }),
    handler: (c) => orders.listOrders(c.db, c.p, c.query as orders.OrderListParams) }),
  r({ method: "GET", path: "/orders/{id}", tag: "Заявки", module: "orders", summary: "Заявка с позициями", handler: (c) => orders.getOrder(c.db, c.p, id(c)) }),
  r({ method: "POST", path: "/orders", tag: "Заявки", module: "orders", write: true, summary: "Создать заявку (цены по типу цены клиента, если не указаны)", body: orders.orderInput,
    handler: (c) => orders.createOrder(c.db, c.p, { ...(c.body as orders.OrderInput), source: "api" }) }),
  r({ method: "POST", path: "/orders/{id}/status", tag: "Заявки", module: "orders", write: true, summary: "Сменить статус заявки",
    body: z.object({ statusId: z.number().int(), comment: z.string().max(500).optional() }),
    handler: async (c) => { const b = c.body as { statusId: number; comment?: string }; await orders.setStatus(c.db, c.p, id(c), b.statusId, b.comment); return orders.getOrder(c.db, c.p, id(c)); } }),
  r({ method: "GET", path: "/order-statuses", tag: "Заявки", module: "orders", summary: "Статусы заявок", handler: (c) => orders.statuses(c.db) }),

  /* Документы */
  r({ method: "GET", path: "/shipments", tag: "Документы", module: "shipments", summary: "Отгрузки и возвраты",
    query: z.object({ kind: z.enum(["shipment", "return"]).optional(), counterpartyId: int.optional(), from: day.optional(), to: day.optional(), ...page }),
    handler: (c) => shipments.listShipments(c.db, c.p, c.query as never) }),
  r({ method: "GET", path: "/shipments/{id}", tag: "Документы", module: "shipments", summary: "Отгрузка", handler: (c) => shipments.getShipment(c.db, c.p, id(c)) }),
  r({ method: "POST", path: "/shipments", tag: "Документы", module: "shipments", write: true, summary: "Провести отгрузку или возврат", body: shipments.shipmentInput, handler: (c) => shipments.createShipment(c.db, c.p, c.body as shipments.ShipmentInput) }),
  r({ method: "GET", path: "/receipts", tag: "Документы", module: "receipts", summary: "Приёмки", query: z.object({ q: z.string().optional(), supplierId: int.optional(), ...page }),
    handler: (c) => receipts.listReceipts(c.db, c.p, c.query as never) }),
  r({ method: "POST", path: "/receipts", tag: "Документы", module: "receipts", write: true, summary: "Создать приёмку", body: receipts.receiptInput, handler: (c) => receipts.createReceipt(c.db, c.p, c.body as receipts.ReceiptInput) }),
  r({ method: "GET", path: "/payments", tag: "Деньги", module: "payments", summary: "Оплаты", query: z.object({ direction: z.enum(["in", "out"]).optional(), counterpartyId: int.optional(), from: day.optional(), to: day.optional(), ...page }),
    handler: (c) => finance.listPayments(c.db, c.p, c.query as never) }),
  r({ method: "POST", path: "/payments", tag: "Деньги", module: "payments", write: true, summary: "Провести оплату (in — от клиента, out — поставщику)", body: finance.paymentInput, handler: (c) => finance.createPayment(c.db, c.p, c.body as finance.PaymentInput) }),

  /* CRM */
  r({ method: "GET", path: "/tasks", tag: "CRM", module: "tasks", summary: "Задачи (сотрудник видит свои и поставленные им)", query: z.object({ q: z.string().optional(), assigneeId: int.optional() }),
    handler: (c) => tasks.board(c.db, c.p, c.query as never) }),
  r({ method: "POST", path: "/tasks", tag: "CRM", module: "tasks", write: true, summary: "Создать задачу", body: tasks.taskInput, handler: (c) => tasks.createTask(c.db, c.p, c.body as tasks.TaskInput) }),
  r({ method: "GET", path: "/leads", tag: "CRM", module: "pipeline", summary: "Лиды по этапам воронки", query: z.object({ q: z.string().optional(), managerId: int.optional() }),
    handler: (c) => leads.board(c.db, c.p, c.query as never) }),
  r({ method: "POST", path: "/leads", tag: "CRM", module: "pipeline", write: true, summary: "Создать лид (например, с сайта)", body: leads.leadInput, handler: (c) => leads.createLead(c.db, c.p, c.body as leads.LeadInput) }),

  /* Отчёты */
  r({ method: "GET", path: "/reports/sales", tag: "Отчёты", module: "analytics", summary: "KPI продаж за период (прибыль — только с правом seeProfit)",
    query: z.object({ from: day.optional(), to: day.optional() }),
    handler: (c) => { const q = c.query as { from?: string; to?: string }; return kpis(c.db, c.p, q.from ?? addDays(today(), -29), q.to ?? today()); } }),
];

/** Сопоставление пути с шаблоном: /orders/{id} */
export function matchRoute(method: string, path: string) {
  for (const rt of API_ROUTES) {
    if (rt.method !== method) continue;
    const a = rt.path.split("/"), b = path.replace(/\/+$/, "").split("/");
    if (a.length !== b.length) continue;
    const params: Record<string, string> = {};
    if (a.every((seg, i) => (seg.startsWith("{") ? ((params[seg.slice(1, -1)] = b[i]), /^\d+$/.test(b[i])) : seg === b[i]))) return { route: rt, params };
  }
  return null;
}

export function checkAccess(p: Principal, rt: ApiRoute) { assertCan(p, rt.module, rt.write ? "full" : "view"); }

/* ───── OpenAPI 3.1 ───── */

export function openApiSpec(baseUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const rt of API_ROUTES) {
    const params = [...rt.path.matchAll(/\{(\w+)\}/g)].map((m) => ({ name: m[1], in: "path", required: true, schema: { type: "integer" } }));
    const q = rt.query ? Object.entries((z.toJSONSchema(rt.query, { io: "input" }) as { properties?: Record<string, unknown>; required?: string[] }).properties ?? {})
      .map(([name, schema]) => ({ name, in: "query", required: false, schema })) : [];
    (paths[rt.path] ??= {})[rt.method.toLowerCase()] = {
      tags: [rt.tag], summary: rt.summary,
      description: `Требуемый доступ: модуль «${rt.module}» — ${rt.write ? "полный" : "просмотр"}.`,
      parameters: [...params, ...q],
      ...(rt.body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(rt.body, { io: "input", unrepresentable: "any" }) } } } } : {}),
      responses: {
        200: { description: "OK", content: { "application/json": { schema: { type: "object", properties: { data: {} } } } } },
        400: { $ref: "#/components/responses/Error" }, 401: { $ref: "#/components/responses/Error" }, 403: { $ref: "#/components/responses/Error" },
        404: { $ref: "#/components/responses/Error" }, 429: { $ref: "#/components/responses/Error" },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: { title: "Electro Demo CRM API", version: "1.0.0", description: "Деньги — целые тиыны (1 ₸ = 100 тиын). Даты — ГГГГ-ММ-ДД (Asia/Almaty). Лимит: 120 запросов в минуту на токен. Ответ: { data } или { error }." },
    servers: [{ url: `${baseUrl}/api/v1` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "API-токен из Настройки → API и MCP (demo_…)" } },
      responses: { Error: { description: "Ошибка", content: { "application/json": { schema: { type: "object", properties: { error: { type: "string" } }, required: ["error"] } } } } },
    },
    paths,
  };
}
