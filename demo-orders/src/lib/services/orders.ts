import { getData, mutateData } from "@/lib/db";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import type {
  AnyOrderStatus,
  ChecklistItem,
  Client,
  LeadSource,
  Order,
  OrderStage,
  OrderStatus,
  AtelierOrderStatus,
  ProductionStageKey,
  Task,
  EmployeeReport,
  Employee,
} from "@/types";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
  stageLabel,
  type OrderWorkerVisibility,
} from "@/types";
import { filterStageKeys, getFunnel } from "@/lib/services/production-funnel";
import { normalizeVisibility } from "@/lib/order-visibility";

export function anyOrderStatusLabel(status: AnyOrderStatus): string {
  if (status in ATELIER_ORDER_STATUS_LABELS) {
    return ATELIER_ORDER_STATUS_LABELS[
      status as keyof typeof ATELIER_ORDER_STATUS_LABELS
    ];
  }
  return ORDER_STATUS_LABELS[status as OrderStatus] ?? String(status);
}
import { logActivity } from "@/lib/services/activity";
import { addNotificationInData, createNotification } from "@/lib/services/notifications";
import { createSystemTasksForOrder } from "@/lib/services/tasks";
import { syncPrepayment } from "@/lib/services/cash";

export type Actor = {
  id: string;
  name: string;
};

export type CreateOrderInput = {
  clientId: string;
  address?: string | null;
  source: LeadSource;
  status?: OrderStatus;
  amount: number;
  prepayment?: number;
  cost?: number;
  date?: string;
  deadline: string;
  responsibleId?: string | null;
  masterId?: string | null;
  masterIds?: string[];
  description: string;
  comment?: string | null;
  furnitureUnits?: number;
  materialsNote?: string | null;
  hardwareNote?: string | null;
  stages?: ProductionStageKey[];
  workerVisibility?: Partial<OrderWorkerVisibility> | null;
};

export type OrderDetail = Order & {
  client: Client | null;
  master: Employee | null;
  stages: OrderStage[];
  checklist: ChecklistItem[];
  tasks: Task[];
  reports: EmployeeReport[];
};

function nextOrderNumber(companyId: string): string {
  const numbers = getData()
    .orders.filter((o) => o.companyId === companyId)
    .map((o) => Number.parseInt(o.number, 10))
    .filter((n) => !Number.isNaN(n));
  const max = numbers.length ? Math.max(...numbers) : 1000;
  return String(max + 1);
}

function checklistFromMaterialsNote(
  companyId: string,
  orderId: string,
  materialsNote: string | null | undefined,
  responsibleId: string | null,
): ChecklistItem[] {
  if (!materialsNote?.trim()) return [];
  const parts = materialsNote
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((name) => ({
    id: generateId("chk"),
    companyId,
    orderId,
    category: "material" as const,
    name,
    quantity: 1,
    unit: "шт",
    done: false,
    responsibleId,
    comment: null,
  }));
}

export function listOrders(
  companyId: string,
  opts?: {
    status?: OrderStatus;
    masterId?: string;
    search?: string;
  },
): Order[] {
  let orders = getData().orders.filter((o) => o.companyId === companyId && isActiveOrder(o));
  if (opts?.status) {
    orders = orders.filter((o) => o.status === opts.status);
  }
  if (opts?.masterId) {
    orders = orders.filter((o) => o.masterId === opts.masterId || o.masterIds?.includes(opts.masterId as string) === true);
  }
  if (opts?.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    const data = getData();
    orders = orders.filter((o) => {
      const client = data.clients.find((c) => c.id === o.clientId);
      return (
        o.number.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        (client?.fullName.toLowerCase().includes(q) ?? false) ||
        (client?.phone.includes(q) ?? false)
      );
    });
  }
  return orders.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getOrder(companyId: string, id: string): OrderDetail | null {
  const data = getData();
  const order =
    data.orders.find(
      (o) =>
        o.companyId === companyId && isActiveOrder(o) && (o.id === id || o.number === id),
    ) ?? null;
  if (!order) return null;

  return {
    ...order,
    client: data.clients.find((c) => c.id === order.clientId) ?? null,
    master: (order.masterId || order.masterIds?.[0])
      ? (data.employees.find((e) => e.id === (order.masterId || order.masterIds?.[0])) ?? null)
      : null,
    stages: data.orderStages
      .filter((s) => s.orderId === order.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
    checklist: data.checklistItems.filter((c) => c.orderId === order.id),
    tasks: data.tasks.filter((t) => t.orderId === order.id),
    reports: data.reports
      .filter((r) => r.orderId === order.id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  };
}

export function createOrder(
  companyId: string,
  input: CreateOrderInput,
  actor: Actor,
): Order {
  const now = nowIso();
  const number = nextOrderNumber(companyId);
  const cost = input.cost ?? Math.round(input.amount * 0.6);
  const order: Order = {
    id: generateId("order"),
    companyId,
    number,
    clientId: input.clientId,
    source: input.source,
    status: input.status ?? "lead",
    amount: input.amount,
    prepayment: input.prepayment ?? 0,
    cost,
    profit: input.amount - cost,
    date: input.date ?? todayDate(),
    deadline: input.deadline,
    responsibleId: input.responsibleId ?? null,
    masterId: input.masterIds !== undefined ? input.masterIds[0] ?? null : input.masterId ?? null,
    masterIds: input.masterIds ?? (input.masterId ? [input.masterId] : []),
    description: input.description,
    address: input.address ?? null,
    comment: input.comment ?? null,
    furnitureUnits: input.furnitureUnits ?? 1,
    materialsNote: input.materialsNote ?? null,
    hardwareNote: input.hardwareNote ?? null,
    media: [],
    workerVisibility: input.workerVisibility
      ? normalizeVisibility(input.workerVisibility)
      : null,
    createdAt: now,
    updatedAt: now,
  };

  const funnel = getFunnel(companyId);
  const order_ = funnel.map((s) => s.key as string);
  const stageKeys = filterStageKeys(companyId, input.stages ?? []).sort(
    (a, b) => order_.indexOf(a) - order_.indexOf(b),
  );
  const stages: OrderStage[] = stageKeys.map((key, i) => ({
    id: generateId("stage"),
    companyId,
    orderId: order.id,
    key,
    label: stageLabel(key, funnel),
    sortOrder: i + 1,
    status: "pending",
    responsibleId: order.masterId,
    startDate: null,
    endDate: null,
    durationHours: null,
    comment: null,
    media: [],
  }));

  const checklist = checklistFromMaterialsNote(
    companyId,
    order.id,
    input.materialsNote,
    order.masterId,
  );

  mutateData((data) => {
    data.orders.push(order);
    syncPrepayment(data, order, input.prepayment ?? 0);
    data.orderStages.push(...stages);
    data.checklistItems.push(...checklist);

    const client = data.clients.find((c) => c.id === order.clientId);
    if (client) {
      client.ordersCount += 1;
      client.totalAmount += order.amount;
      client.lastOrderAt = order.date;
    }
  });

  createSystemTasksForOrder(order.id);

  logActivity({
    companyId,
    actorId: actor.id,
    actorName: actor.name,
    action: `Создал заказ №${order.number}`,
    entityType: "order",
    entityId: order.id,
  });

  const managers = getData().users.filter(
    (u) =>
      u.companyId === companyId &&
      u.isActive &&
      (u.role === "OWNER" || u.role === "DIRECTOR" || u.role === "MANAGER"),
  );
  for (const u of managers) {
    void createNotification({
      companyId,
      userId: u.id,
      type: "new_order",
      title: `Новый заказ ${order.number}`,
      body: `${order.description.slice(0, 80)} — ${order.amount.toLocaleString("ru-KZ")} ₸`,
      href: `/orders/${order.number}`,
    });
  }

  return order;
}

function statusLabel(status: AnyOrderStatus): string {
  return anyOrderStatusLabel(status);
}

export function updateOrderStatus(
  companyId: string,
  orderId: string,
  status: AnyOrderStatus,
  actor: Actor,
): Order | null {
  let updated: Order | null = null;
  mutateData((data) => {
    const order = data.orders.find(
      (o) =>
        o.companyId === companyId && isActiveOrder(o) && (o.id === orderId || o.number === orderId),
    );
    if (!order) return;
    const prev = order.status;
    if (!status) throw new Error("Укажите статус заказа");
    order.status = status;
    order.updatedAt = nowIso();
    updated = { ...order };

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Изменил статус заказа №${order.number}: ${statusLabel(prev)} → ${statusLabel(status)}`,
      entityType: "order",
      entityId: order.id,
      createdAt: nowIso(),
    });

    for (const u of data.users.filter(
      (x) =>
        x.companyId === companyId &&
        x.isActive &&
        (x.role === "OWNER" ||
          x.role === "DIRECTOR" ||
          x.role === "MANAGER" ||
          x.role === "ADMIN"),
    )) {
      addNotificationInData(data, {
        companyId,
        userId: u.id,
        type: "status_change",
        title: `Заказ ${order.number} — ${statusLabel(status)}`,
        body: `Статус изменён на «${statusLabel(status)}»`,
        href: `/orders/${order.number}`,
        dedupeKey: `order-status:${order.id}:${order.updatedAt}:${u.id}`,
      });
    }
  });
  return updated;
}

export function updateOrder(
  companyId: string,
  orderId: string,
  patch: Partial<
    Pick<
      Order,
      | "clientId"
      | "source"
      | "amount"
      | "cost"
      | "address"
      | "date"
      | "deadline"
      | "responsibleId"
      | "masterId"
      | "masterIds"
      | "closedAt"
      | "description"
      | "comment"
      | "furnitureUnits"
      | "materialsNote"
      | "hardwareNote"
      | "media"
      | "workerVisibility"
    >
  > & {
    /** Синхронизируется с кассовой записью предоплаты. */
    prepayment?: number;
    /** Контакты клиента заказа. */
    client?: { fullName?: string; phone?: string; address?: string | null };
  },
  actor: Actor,
): Order | null {
  let updated: Order | null = null;
  mutateData((data) => {
    const order = data.orders.find(
      (o) =>
        o.companyId === companyId && isActiveOrder(o) && (o.id === orderId || o.number === orderId),
    );
    if (!order) return;
    const { prepayment, client: clientPatch, ...fields } = patch;
    Object.assign(order, fields);
    if (patch.masterIds !== undefined) {
      order.masterIds = [...new Set(patch.masterIds)].slice(0, 2);
      order.masterId = order.masterIds[0] ?? null;
    } else if (patch.masterId !== undefined) {
      order.masterIds = patch.masterId ? [patch.masterId] : [];
    }
    if (prepayment != null) syncPrepayment(data, order, prepayment);
    if (clientPatch) {
      const client = data.clients.find((c) => c.companyId === companyId && c.id === order.clientId);
      if (client) {
        if (clientPatch.fullName) client.fullName = clientPatch.fullName;
        if (clientPatch.phone) client.phone = clientPatch.phone;
        if (clientPatch.address !== undefined) client.address = clientPatch.address;
      }
    }
    if (patch.amount != null || patch.cost != null) {
      order.profit = order.amount - order.cost;
    }
    order.updatedAt = nowIso();
    updated = { ...order };

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Обновил заказ №${order.number}`,
      entityType: "order",
      entityId: order.id,
      createdAt: nowIso(),
    });
  });
  return updated;
}

export function getOrdersByStatus(
  companyId: string,
  opts?: { masterId?: string },
): Record<OrderStatus, number> {
  const counts: Record<OrderStatus, number> = {
    lead: 0,
    application: 0,
    contract: 0,
    approval: 0,
    production: 0,
    installation: 0,
    closed: 0,
  };
  for (const o of listOrders(companyId, opts)) {
    if (o.status in counts) {
      counts[o.status as OrderStatus] += 1;
    }
  }
  return counts;
}

export function getAtelierOrdersByStatus(
  companyId: string,
): Record<AtelierOrderStatus, number> {
  const counts: Record<AtelierOrderStatus, number> = {
    draft: 0,
    measurement: 0,
    awaiting: 0,
    in_work: 0,
    completed: 0,
    cancelled: 0,
  };
  for (const o of listOrders(companyId)) {
    if (o.status in counts) {
      counts[o.status as AtelierOrderStatus] += 1;
    }
  }
  return counts;
}

export function toggleChecklistItem(
  companyId: string,
  orderId: string,
  itemId: string,
  actor: Actor,
  done?: boolean,
): ChecklistItem | null {
  let updated: ChecklistItem | null = null;
  mutateData((data) => {
    const order = data.orders.find(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.id === orderId || o.number === orderId),
    );
    if (!order) return;

    const item = data.checklistItems.find(
      (c) =>
        c.companyId === companyId &&
        c.orderId === order.id &&
        c.id === itemId,
    );
    if (!item) return;

    item.done = done ?? !item.done;
    order.updatedAt = nowIso();
    updated = { ...item };

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `${item.done ? "Отметил" : "Снял"} пункт чек-листа «${item.name}» (заказ №${order.number})`,
      entityType: "order",
      entityId: order.id,
      createdAt: nowIso(),
    });
  });
  return updated;
}

export function getTodayOrders(companyId: string): Order[] {
  const today = todayDate();
  return listOrders(companyId).filter(
    (o) => o.date === today || o.deadline === today,
  );
}

export function getOverdueOrders(companyId: string): Order[] {
  const today = todayDate();
  return listOrders(companyId).filter(
    (o) => o.status !== "closed" && o.deadline < today,
  );
}

export function getInstallationOrders(companyId: string): Order[] {
  return listOrders(companyId, { status: "installation" });
}
