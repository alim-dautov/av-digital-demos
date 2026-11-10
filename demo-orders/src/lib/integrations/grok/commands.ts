import { z } from "zod";
import { can } from "@/lib/rbac";
import { cashBalance } from "@/lib/services/cash";
import { createNotification } from "@/lib/services/notifications";
import { getAtelierProfit, orderProfit, resolvePeriod } from "@/lib/services/atelier-profit";
import { createTask } from "@/lib/services/tasks";
import { listWorkshopOrders, sendToWorkshop, WorkshopError } from "@/lib/services/workshop";
import { todayDate } from "@/lib/utils";
import {
  ATELIER_ORDER_STATUS_LABELS,
  type AppData,
  type Order,
  type AtelierOrderStatus,
  type SessionUser,
  type Task,
} from "@/types";
import { canSeeOrder, findVisibleOrder, hidesMoney } from "./access";
import { GrokCommandError } from "./errors";

export type GrokCommandKind = "read" | "write" | "critical";
export type GrokCommandGroup = "orders" | "finance" | "staff" | "notifications";

export type GrokContext<A> = { actor: SessionUser; data: AppData; args: A };

export type GrokExecution = {
  message: string;
  data: unknown;
  entityType: string;
  entityId: string | null;
};

export type GrokPrepared = {
  /** What would change, in plain words */
  preview: string;
  data?: unknown;
  execute(): Promise<GrokExecution>;
};

export type GrokCommand = {
  name: string;
  label: string;
  description: string;
  group: GrokCommandGroup;
  kind: GrokCommandKind;
  /** Human-readable requirement shown in docs and settings */
  permission: string;
  allowed(actor: SessionUser): boolean;
  args: z.ZodType;
  run?(ctx: GrokContext<unknown>): unknown;
  prepare?(ctx: GrokContext<unknown>): GrokPrepared;
};

type Base = Pick<GrokCommand, "name" | "label" | "description" | "group" | "permission" | "allowed">;

function readCommand<S extends z.ZodType>(
  def: Base & { args: S; run(ctx: GrokContext<z.infer<S>>): unknown },
): GrokCommand {
  return { ...def, kind: "read", run: def.run as GrokCommand["run"] };
}

function writeCommand<S extends z.ZodType>(
  def: Base & { args: S; prepare(ctx: GrokContext<z.infer<S>>): GrokPrepared },
): GrokCommand {
  return { ...def, kind: "write", prepare: def.prepare as GrokCommand["prepare"] };
}

/** Listed so the bot knows they exist; the connector never executes them. */
function criticalCommand(def: Omit<Base, "allowed">): GrokCommand {
  return { ...def, kind: "critical", allowed: () => false, args: z.unknown() };
}

const DAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");
const ORDER_KEY = z.string().trim().min(1).max(64);
const LIMIT = z.number().int().min(1).max(100).default(20);
const ATELIER_STATUSES = Object.keys(ATELIER_ORDER_STATUS_LABELS) as [
  AtelierOrderStatus,
  ...AtelierOrderStatus[],
];
const PERIOD = z
  .object({
    preset: z.enum(["month", "quarter", "year", "all", "custom"]).optional(),
    from: DAY.optional(),
    to: DAY.optional(),
  })
  .default({});

function statusLabel(status: string): string {
  return ATELIER_ORDER_STATUS_LABELS[status as AtelierOrderStatus] ?? status;
}

function clientName(data: AppData, order: Order): string {
  return (
    data.clients.find((c) => c.id === order.clientId)?.fullName ??
    order.atelierQuote?.clientName ??
    "Клиент не указан"
  );
}

function employeeName(data: AppData, id: string | null | undefined): string | null {
  if (!id) return null;
  return data.employees.find((e) => e.id === id)?.fullName ?? null;
}

function orderSummary(data: AppData, actor: SessionUser, order: Order) {
  return {
    id: order.id,
    number: order.number,
    status: order.status,
    statusLabel: statusLabel(order.status),
    clientName: clientName(data, order),
    date: order.date,
    deadline: order.deadline,
    responsible: employeeName(data, order.responsibleId),
    ...(hidesMoney(actor) ? {} : { amount: Number(order.amount) || 0 }),
  };
}

function visibleOrders(data: AppData, actor: SessionUser): Order[] {
  return data.orders
    .filter((o) => o.companyId === actor.companyId && canSeeOrder(actor, o))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

function categoryLabels(data: AppData, companyId: string, byCategory: Record<string, number>) {
  const labels = new Map(
    data.expenseCategories.filter((c) => c.companyId === companyId).map((c) => [c.key, c.label]),
  );
  return Object.entries(byCategory).map(([key, amount]) => ({
    key,
    label: labels.get(key) ?? key,
    amount,
  }));
}

function periodOf(args: z.infer<typeof PERIOD>) {
  const p = resolvePeriod(args.preset ?? (args.from || args.to ? "custom" : "month"), args.from, args.to);
  return { period: p, filter: { from: p.from, to: p.to } };
}

function taskSummary(data: AppData, task: Task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    deadline: task.deadline,
    assignee: employeeName(data, task.assigneeId),
    orderNumber: task.orderId
      ? (data.orders.find((o) => o.id === task.orderId)?.number ?? null)
      : null,
  };
}

function isOverdue(task: Task, today: string): boolean {
  return task.status !== "done" && (task.status === "overdue" || task.deadline < today);
}

const canSeeFinance = (a: SessionUser) => can(a, "finance", "read");
const canSeeCosting = (a: SessionUser) => can(a, "costing", "read");

export const GROK_COMMANDS: GrokCommand[] = [
  readCommand({
    name: "orders.list",
    label: "Список заказов",
    description: "Последние заказы, видимые пользователю. Фильтр по статусу.",
    group: "orders",
    permission: "Заказы: чтение",
    allowed: (a) => can(a, "orders", "read"),
    args: z.object({ status: z.enum(ATELIER_STATUSES).optional(), limit: LIMIT }).default({ limit: 20 }),
    run: ({ actor, data, args }) => {
      const orders = visibleOrders(data, actor).filter((o) => !args.status || o.status === args.status);
      return {
        total: orders.length,
        orders: orders.slice(0, args.limit).map((o) => orderSummary(data, actor, o)),
      };
    },
  }),
  readCommand({
    name: "orders.find",
    label: "Найти заказ",
    description: "Поиск по номеру заказа или имени клиента.",
    group: "orders",
    permission: "Заказы: чтение",
    allowed: (a) => can(a, "orders", "read"),
    args: z.object({ query: z.string().trim().min(1).max(100), limit: LIMIT }),
    run: ({ actor, data, args }) => {
      const q = args.query.toLowerCase();
      const found = visibleOrders(data, actor).filter(
        (o) => o.number.toLowerCase().includes(q) || clientName(data, o).toLowerCase().includes(q),
      );
      return {
        total: found.length,
        orders: found.slice(0, args.limit).map((o) => orderSummary(data, actor, o)),
      };
    },
  }),
  readCommand({
    name: "orders.status",
    label: "Статус заказа",
    description: "Текущий статус и последние изменения.",
    group: "orders",
    permission: "Заказы: чтение",
    allowed: (a) => can(a, "orders", "read"),
    args: z.object({ order: ORDER_KEY }),
    run: ({ actor, data, args }) => {
      const order = findVisibleOrder(data, actor, args.order);
      return {
        ...orderSummary(data, actor, order),
        history: (order.statusHistory ?? []).slice(-10).map((h) => ({
          status: h.status,
          statusLabel: statusLabel(h.status),
          at: h.at,
          by: h.actorName,
        })),
      };
    },
  }),
  readCommand({
    name: "orders.sewing",
    label: "Пошив заказа",
    description: "Передан ли заказ в цех, кто принял в работу, ответственный.",
    group: "orders",
    permission: "Заказы: чтение",
    allowed: (a) => can(a, "orders", "read"),
    args: z.object({ order: ORDER_KEY }),
    run: ({ actor, data, args }) => {
      const order = findVisibleOrder(data, actor, args.order);
      const queued = listWorkshopOrders(actor.companyId).find((o) => o.id === order.id);
      return {
        number: order.number,
        status: order.status,
        statusLabel: statusLabel(order.status),
        inWorkshop: Boolean(order.sewingOrderAt),
        sewingOrderAt: order.sewingOrderAt ?? null,
        acceptedBy: order.acceptedBy?.name ?? null,
        acceptedAt: order.acceptedAt ?? null,
        master: employeeName(data, order.masterId),
        responsible: employeeName(data, order.responsibleId),
        work: queued?.summary || null,
        deadline: order.deadline,
      };
    },
  }),
  writeCommand({
    name: "orders.sendToWorkshop",
    label: "Передать заказ в пошив",
    description: "Ставит заказ в очередь цеха и уведомляет швей.",
    group: "orders",
    permission: "Заказы или калькулятор: запись",
    allowed: (a) => can(a, "orders", "write") || can(a, "calculator", "write"),
    args: z.object({
      order: ORDER_KEY,
      roomIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200).optional(),
    }),
    prepare: ({ actor, data, args }) => {
      const order = findVisibleOrder(data, actor, args.order);
      if (order.status === "completed") throw new GrokCommandError("Заказ уже завершён", 409);
      if (order.status === "cancelled") throw new GrokCommandError("Заказ отменён", 409);
      if (order.status === "in_work" && !args.roomIds) {
        throw new GrokCommandError("Заказ уже в работе", 409);
      }
      const already = order.status === "awaiting" && !args.roomIds;
      return {
        preview: already
          ? `Заказ ${order.number} уже ждёт в цехе, изменений не будет`
          : `Заказ ${order.number} будет передан в цех, швеи получат уведомление`,
        data: { number: order.number, status: order.status, roomIds: args.roomIds ?? null },
        execute: async () => {
          try {
            const sent = await sendToWorkshop(
              actor.companyId,
              order.id,
              { id: actor.id, name: actor.fullName },
              args.roomIds,
            );
            return {
              message: sent.alreadySent
                ? `Заказ ${order.number} уже в цехе`
                : `Заказ ${order.number} передан в цех, уведомлено: ${sent.notified}`,
              data: {
                number: sent.order.number,
                status: sent.order.status,
                notified: sent.notified,
                alreadySent: sent.alreadySent,
              },
              entityType: "order",
              entityId: order.id,
            };
          } catch (error) {
            if (error instanceof WorkshopError) throw new GrokCommandError(error.message, error.status);
            throw error;
          }
        },
      };
    },
  }),
  criticalCommand({
    name: "orders.changeStatus",
    label: "Сменить статус заказа",
    description: "Только в CRM: смена статуса, кроме передачи в пошив.",
    group: "orders",
    permission: "Не выполняется через коннектор",
  }),
  criticalCommand({
    name: "orders.delete",
    label: "Удалить заказ",
    description: "Только в CRM.",
    group: "orders",
    permission: "Не выполняется через коннектор",
  }),

  readCommand({
    name: "finance.revenue",
    label: "Выручка за период",
    description: "Сумма проданных заказов за период (по дате заказа, Алматы).",
    group: "finance",
    permission: "Финансы: чтение",
    allowed: canSeeFinance,
    args: z.object({ period: PERIOD }).default({ period: {} }),
    run: ({ actor, data, args }) => {
      const { period, filter } = periodOf(args.period);
      const { totals } = getAtelierProfit(actor.companyId, filter, data);
      return { period, orders: totals.orders, revenue: totals.revenue };
    },
  }),
  readCommand({
    name: "finance.order",
    label: "Расходы и себестоимость заказа",
    description: "Фактические расходы по категориям, плановая себестоимость и прибыль заказа.",
    group: "finance",
    permission: "Себестоимость: чтение",
    allowed: canSeeCosting,
    args: z.object({ order: ORDER_KEY }),
    run: ({ actor, data, args }) => {
      const order = data.orders.find(
        (o) => o.companyId === actor.companyId && (o.id === args.order || o.number === args.order),
      );
      if (!order) throw new GrokCommandError("Заказ не найден", 404, "denied");
      const row = orderProfit(data, order);
      return {
        number: row.number,
        clientName: row.clientName,
        status: row.status,
        revenue: row.revenue,
        expenses: row.expenses,
        plannedCost: row.plannedCost,
        netProfit: row.netProfit,
        marginPercent: row.marginPercent,
        hasExpenses: row.hasExpenses,
        byCategory: categoryLabels(data, actor.companyId, row.byCategory),
      };
    },
  }),
  readCommand({
    name: "finance.profit",
    label: "Чистая прибыль",
    description: "Выручка минус фактические расходы по заказам за период.",
    group: "finance",
    permission: "Финансы и себестоимость: чтение",
    allowed: (a) => canSeeFinance(a) && canSeeCosting(a),
    args: z.object({ period: PERIOD }).default({ period: {} }),
    run: ({ actor, data, args }) => {
      const { period, filter } = periodOf(args.period);
      const { totals } = getAtelierProfit(actor.companyId, filter, data);
      return {
        period,
        orders: totals.orders,
        revenue: totals.revenue,
        expenses: totals.expenses,
        netProfit: totals.netProfit,
        marginPercent: totals.marginPercent,
        ordersWithoutExpenses: totals.ordersWithoutExpenses,
      };
    },
  }),
  readCommand({
    name: "finance.summary",
    label: "Сводный финансовый отчёт",
    description: "Выручка, касса и, при праве на себестоимость, расходы, прибыль и крупнейшие заказы.",
    group: "finance",
    permission: "Финансы: чтение (себестоимость — отдельно)",
    allowed: canSeeFinance,
    args: z.object({ period: PERIOD }).default({ period: {} }),
    run: ({ actor, data, args }) => {
      const { period, filter } = periodOf(args.period);
      const { rows, totals } = getAtelierProfit(actor.companyId, filter, data);
      const base = {
        period,
        orders: totals.orders,
        revenue: totals.revenue,
        cashBalance: cashBalance(actor.companyId),
      };
      if (!canSeeCosting(actor)) return { ...base, costingHidden: true };
      return {
        ...base,
        expenses: totals.expenses,
        netProfit: totals.netProfit,
        marginPercent: totals.marginPercent,
        ordersWithoutExpenses: totals.ordersWithoutExpenses,
        byCategory: categoryLabels(data, actor.companyId, totals.byCategory),
        topOrders: [...rows]
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)
          .map((r) => ({ number: r.number, clientName: r.clientName, revenue: r.revenue, netProfit: r.netProfit })),
      };
    },
  }),
  criticalCommand({
    name: "finance.addPayment",
    label: "Провести оплату",
    description: "Только в CRM: оплаты и записи в кассу.",
    group: "finance",
    permission: "Не выполняется через коннектор",
  }),
  criticalCommand({
    name: "finance.editExpense",
    label: "Изменить или удалить расход",
    description: "Только в CRM.",
    group: "finance",
    permission: "Не выполняется через коннектор",
  }),

  readCommand({
    name: "employees.list",
    label: "Сотрудники",
    description: "ФИО, должность, роль и статус. Без телефонов и зарплат.",
    group: "staff",
    permission: "Сотрудники: чтение",
    allowed: (a) => can(a, "employees", "read"),
    args: z.object({}).default({}),
    run: ({ actor, data }) => ({
      employees: data.employees
        .filter((e) => e.companyId === actor.companyId)
        .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"))
        .map((e) => ({ id: e.id, fullName: e.fullName, position: e.position, role: e.role, status: e.status })),
    }),
  }),
  readCommand({
    name: "tasks.list",
    label: "Задачи",
    description: "Текущие задачи и их статусы.",
    group: "staff",
    permission: "Задачи: чтение",
    allowed: (a) => can(a, "tasks", "read"),
    args: z
      .object({
        status: z.enum(["todo", "in_progress", "done", "overdue"]).optional(),
        assigneeId: z.string().trim().min(1).max(64).optional(),
        limit: LIMIT,
      })
      .default({ limit: 20 }),
    run: ({ actor, data, args }) => {
      const tasks = data.tasks
        .filter(
          (t) =>
            t.companyId === actor.companyId &&
            (!args.status || t.status === args.status) &&
            (!args.assigneeId || t.assigneeId === args.assigneeId),
        )
        .sort((a, b) => a.deadline.localeCompare(b.deadline));
      return { total: tasks.length, tasks: tasks.slice(0, args.limit).map((t) => taskSummary(data, t)) };
    },
  }),
  readCommand({
    name: "tasks.overdue",
    label: "Просроченные задачи",
    description: "Незавершённые задачи со сроком раньше сегодняшнего дня.",
    group: "staff",
    permission: "Задачи: чтение",
    allowed: (a) => can(a, "tasks", "read"),
    args: z.object({ limit: LIMIT }).default({ limit: 20 }),
    run: ({ actor, data, args }) => {
      const today = todayDate();
      const tasks = data.tasks
        .filter((t) => t.companyId === actor.companyId && isOverdue(t, today))
        .sort((a, b) => a.deadline.localeCompare(b.deadline));
      return { today, total: tasks.length, tasks: tasks.slice(0, args.limit).map((t) => taskSummary(data, t)) };
    },
  }),
  writeCommand({
    name: "tasks.create",
    label: "Создать задачу или напоминание",
    description: "Новая задача со сроком, исполнителем и привязкой к заказу.",
    group: "staff",
    permission: "Задачи: запись",
    allowed: (a) => can(a, "tasks", "write"),
    args: z.object({
      title: z.string().trim().min(1).max(200),
      description: z.string().trim().max(2000).optional(),
      deadline: DAY,
      assigneeId: z.string().trim().min(1).max(64).optional(),
      order: ORDER_KEY.optional(),
      priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
    }),
    prepare: ({ actor, data, args }) => {
      const assignee = args.assigneeId
        ? data.employees.find((e) => e.companyId === actor.companyId && e.id === args.assigneeId)
        : null;
      if (args.assigneeId && !assignee) throw new GrokCommandError("Исполнитель не найден", 404, "denied");
      const order = args.order ? findVisibleOrder(data, actor, args.order) : null;
      const who = assignee ? `, исполнитель ${assignee.fullName}` : "";
      return {
        preview: `Будет создана задача «${args.title}» на ${args.deadline}${who}`,
        data: { title: args.title, deadline: args.deadline, assignee: assignee?.fullName ?? null, orderNumber: order?.number ?? null },
        execute: async () => {
          const task = createTask({
            companyId: actor.companyId,
            title: args.title,
            description: args.description,
            deadline: args.deadline,
            assigneeId: assignee?.id ?? null,
            orderId: order?.id ?? null,
            priority: args.priority,
          });
          return {
            message: `Задача «${task.title}» создана`,
            data: taskSummary(data, task),
            entityType: "task",
            entityId: task.id,
          };
        },
      };
    },
  }),

  writeCommand({
    name: "notifications.create",
    label: "Отправить уведомление",
    description: "Уведомление в CRM и push сотруднику своей компании.",
    group: "notifications",
    permission: "Уведомления: запись",
    allowed: (a) => can(a, "notifications", "write"),
    args: z.object({
      userId: z.string().trim().min(1).max(64),
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(1000),
    }),
    prepare: ({ actor, data, args }) => {
      const recipient = data.users.find(
        (u) => u.id === args.userId && u.isActive && u.companyId === actor.companyId,
      );
      if (!recipient) throw new GrokCommandError("Получатель не найден", 404, "denied");
      return {
        preview: `Сотрудник ${recipient.fullName} получит уведомление «${args.title}»`,
        data: { recipient: recipient.fullName, title: args.title },
        execute: async () => {
          const created = await createNotification({
            companyId: actor.companyId,
            userId: recipient.id,
            type: "assistant",
            title: args.title,
            body: args.body,
          });
          return {
            message: `Уведомление отправлено: ${recipient.fullName}`,
            data: { id: created?.id ?? null, recipient: recipient.fullName },
            entityType: "notification",
            entityId: created?.id ?? null,
          };
        },
      };
    },
  }),
];

const BY_NAME = new Map(GROK_COMMANDS.map((c) => [c.name, c]));

export function getGrokCommand(name: string): GrokCommand | null {
  return BY_NAME.get(name) ?? null;
}

/** Commands an admin may enable. Critical ones are never enabled. */
export const ENABLEABLE_COMMANDS = GROK_COMMANDS.filter((c) => c.kind !== "critical").map((c) => c.name);
export const DEFAULT_COMMANDS = GROK_COMMANDS.filter((c) => c.kind === "read").map((c) => c.name);

export type GrokCommandInfo = Pick<GrokCommand, "name" | "label" | "description" | "group" | "kind" | "permission">;

export function grokCatalog(): GrokCommandInfo[] {
  return GROK_COMMANDS.map(({ name, label, description, group, kind, permission }) => ({
    name,
    label,
    description,
    group,
    kind,
    permission,
  }));
}
