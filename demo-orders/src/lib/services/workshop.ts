import { getData, mutateDataLocked } from "@/lib/db";
import { selectQuoteRooms } from "@/lib/domain/atelier-calc";
import { can } from "@/lib/rbac";
import { deliverPush } from "@/lib/push";
import { addNotificationInData } from "@/lib/services/notifications";
import { syncExpensesInData } from "@/lib/services/order-expenses";
import { generateId, nowIso } from "@/lib/utils";
import {
  ATELIER_ORDER_STATUS_LABELS,
  type AnyOrderStatus,
  type AppData,
  type Notification,
  type Order,
  type AtelierOrderStatus,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type WorkshopActor = { id: string; name: string };

export class WorkshopError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly order?: Order,
  ) {
    super(message);
  }
}

const TIME_ZONE = "Asia/Almaty";

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(iso));
}

export function atelierStatusLabel(status: AnyOrderStatus): string {
  return ATELIER_ORDER_STATUS_LABELS[status as AtelierOrderStatus] ?? status;
}

function findOrder(data: AppData, companyId: string, idOrNumber: string): Order {
  const order = data.orders.find(
    (o) =>
      o.companyId === companyId &&
      isActiveOrder(o) &&
      (o.id === idOrNumber || o.number === idOrNumber),
  );
  if (!order) throw new WorkshopError("Заказ не найден", 404);
  return order;
}

/** Sets the status and appends to the history. Same status is a no-op. */
export function recordStatus(
  order: Order,
  status: AtelierOrderStatus,
  actor: WorkshopActor | null,
  at = nowIso(),
): boolean {
  if (order.status === status) return false;
  const from = order.status;
  order.status = status;
  order.updatedAt = at;
  order.statusHistory = [
    ...(order.statusHistory ?? []),
    { status, from, at, actorId: actor?.id ?? null, actorName: actor?.name ?? "Система" },
  ];
  return true;
}

function logActivity(data: AppData, order: Order, actor: WorkshopActor, action: string) {
  data.activityLog.unshift({
    id: generateId("act"),
    companyId: order.companyId,
    actorId: actor.id,
    actorName: actor.name,
    action,
    entityType: "order",
    entityId: order.id,
    createdAt: nowIso(),
  });
}

function activeUsers(data: AppData, companyId: string) {
  return data.users.filter((u) => u.isActive && u.companyId === companyId);
}

/** Seamstresses and anyone else who can take orders in the workshop; owners are not included. */
export function workshopRecipients(data: AppData, companyId: string) {
  return activeUsers(data, companyId).filter(
    (u) => u.role !== "OWNER" && u.role !== "ADMIN" && u.role !== "DIRECTOR" && can(u, "workshop", "write"),
  );
}

/** Deputy directors get the acceptance notice. */
export function acceptanceRecipients(data: AppData, companyId: string) {
  return activeUsers(data, companyId).filter((u) => u.role === "DIRECTOR");
}

function clientName(data: AppData, order: Order): string {
  return (
    data.clients.find((c) => c.id === order.clientId)?.fullName ??
    order.atelierQuote?.clientName ??
    "клиент не указан"
  );
}

/** Rooms handed to the workshop; no selection means the whole quote. */
export function workshopRooms(order: Pick<Order, "atelierQuote" | "sewingRoomIds">) {
  const rooms = order.atelierQuote?.rooms ?? [];
  const ids = order.sewingRoomIds;
  return ids?.length ? rooms.filter((r) => ids.includes(r.id)) : rooms;
}

function workSummary(order: Order): string {
  const rooms = workshopRooms(order);
  const names = rooms.map((r) => r.name.trim()).filter(Boolean);
  const items = rooms.reduce(
    (s, r) => s + r.tulle.length + r.portiere.length + r.covers.length + r.pillows.length,
    0,
  );
  const parts: string[] = [];
  if (names.length) parts.push(names.join(", "));
  if (items) parts.push(`${items} поз.`);
  return parts.join(" · ");
}

export type SendResult = { order: Order; notified: number; alreadySent: boolean };

/**
 * Puts the order in the workshop queue and notifies seamstresses.
 * A repeated call for an order already in the workshop only updates the room
 * selection and does not create new notifications.
 */
export async function sendToWorkshop(
  companyId: string,
  orderId: string,
  actor: WorkshopActor,
  roomIds?: string[] | null,
): Promise<SendResult> {
  const created: Notification[] = [];
  const result = mutateDataLocked((data): SendResult => {
    const order = findOrder(data, companyId, orderId);
    let selectedRoomIds: string[] | null = null;
    if (roomIds) {
      if (!order.atelierQuote) throw new WorkshopError("Нет расчёта", 400, { ...order });
      selectedRoomIds = selectQuoteRooms(order.atelierQuote, roomIds).rooms.map((r) => r.id);
      if (!selectedRoomIds.length) {
        throw new WorkshopError("Выберите хотя бы одну комнату", 400, { ...order });
      }
    }
    if (order.status === "completed") {
      throw new WorkshopError("Заказ уже завершён", 409, { ...order });
    }
    if (order.status === "awaiting" || order.status === "in_work") {
      if (!selectedRoomIds) {
        if (order.status === "awaiting") {
          return { order: { ...order }, notified: 0, alreadySent: true };
        }
        throw new WorkshopError("Заказ уже в работе", 409, { ...order });
      }
      order.sewingRoomIds = selectedRoomIds;
      order.updatedAt = nowIso();
      logActivity(
        data,
        order,
        actor,
        `Обновил комнаты заказа ${order.number} в цехе (${selectedRoomIds.length} комн.)`,
      );
      return { order: { ...order }, notified: 0, alreadySent: true };
    }
    if (selectedRoomIds) order.sewingRoomIds = selectedRoomIds;
    const at = nowIso();
    recordStatus(order, "awaiting", actor, at);
    order.sewingOrderAt = at;
    order.acceptedBy = null;
    order.acceptedAt = null;
    syncExpensesInData(data, order, actor.id);
    logActivity(data, order, actor, `Передал заказ ${order.number} в швейный цех`);

    const client = clientName(data, order);
    const summary = workSummary(order);
    const deadline = order.deadline ? `, срок ${order.deadline.split("-").reverse().join(".")}` : "";
    for (const u of workshopRecipients(data, companyId)) {
      const n = addNotificationInData(data, {
        companyId,
        userId: u.id,
        type: "workshop_new",
        title: `Новый заказ в цех: ${order.number}`,
        body: `${client}${summary ? ` · ${summary}` : ""}${deadline}`,
        href: `/workshop?order=${order.number}`,
        dedupeKey: `order:${order.id}:sent:${at}`,
      });
      if (n) created.push(n);
    }
    return { order: { ...order }, notified: created.length, alreadySent: false };
  });
  await deliverPush(created);
  return result;
}

export type AcceptResult = { order: Order };

/**
 * Only one seamstress can take an order: the check and the write happen
 * under an exclusive lock on fresh data.
 */
export async function acceptOrder(
  companyId: string,
  orderId: string,
  actor: WorkshopActor & { firstName: string },
): Promise<AcceptResult> {
  const created: Notification[] = [];
  const result = mutateDataLocked((data): AcceptResult => {
    const order = findOrder(data, companyId, orderId);
    if (order.acceptedBy) {
      const who = order.acceptedBy.userId === actor.id ? "вами" : order.acceptedBy.name;
      const when = order.acceptedAt ? `, ${formatDateTime(order.acceptedAt)}` : "";
      throw new WorkshopError(`Заказ уже принят: ${who}${when}`, 409, { ...order });
    }
    if (order.status !== "awaiting") {
      throw new WorkshopError(
        `Заказ нельзя принять: статус «${atelierStatusLabel(order.status)}»`,
        409,
        { ...order },
      );
    }
    const at = nowIso();
    order.acceptedBy = { userId: actor.id, name: actor.name };
    order.acceptedAt = at;
    recordStatus(order, "in_work", actor, at);
    logActivity(data, order, actor, `Приняла в работу заказ ${order.number}`);

    for (const u of acceptanceRecipients(data, companyId)) {
      const n = addNotificationInData(data, {
        companyId,
        userId: u.id,
        type: "workshop_accepted",
        title: `${actor.firstName} приступила к заказу ${order.number}`,
        body: `${actor.name} приняла заказ ${order.number} в работу ${formatDateTime(at)}`,
        href: `/orders/${order.number}`,
        dedupeKey: `order:${order.id}:accepted:${order.sewingOrderAt ?? ""}`,
      });
      if (n) created.push(n);
    }
    return { order: { ...order } };
  });
  await deliverPush(created);
  return result;
}

/**
 * Manual status change for a textiles order. Moving to "awaiting" goes through
 * the workshop flow so seamstresses are notified.
 */
export async function changeAtelierStatus(
  companyId: string,
  orderId: string,
  status: AtelierOrderStatus,
  actor: WorkshopActor,
  opts: { onlyIfAcceptedBy?: string; requireFrom?: AtelierOrderStatus } = {},
): Promise<Order> {
  if (status === "awaiting") return (await sendToWorkshop(companyId, orderId, actor)).order;

  const created: Notification[] = [];
  const order = mutateDataLocked((data): Order => {
    const order = findOrder(data, companyId, orderId);
    if (opts.onlyIfAcceptedBy && order.acceptedBy?.userId !== opts.onlyIfAcceptedBy) {
      throw new WorkshopError("Завершить заказ может только сотрудник, принявший его", 403, {
        ...order,
      });
    }
    if (opts.requireFrom && order.status !== opts.requireFrom && order.status !== status) {
      throw new WorkshopError(
        `Сейчас статус «${atelierStatusLabel(order.status)}», действие недоступно`,
        409,
        { ...order },
      );
    }
    if (!recordStatus(order, status, actor)) return { ...order };
    if (status === "draft") {
      order.acceptedBy = null;
      order.acceptedAt = null;
      order.sewingOrderAt = null;
    }
    logActivity(
      data,
      order,
      actor,
      `Изменил статус заказа ${order.number} на «${atelierStatusLabel(status)}»`,
    );
    const last = order.statusHistory!.at(-1)!;
    for (const u of activeUsers(data, companyId).filter(
      (x) =>
        x.id !== actor.id &&
        (x.role === "OWNER" || x.role === "DIRECTOR" || x.role === "ADMIN" || x.role === "MANAGER"),
    )) {
      const n = addNotificationInData(data, {
        companyId,
        userId: u.id,
        type: "status_change",
        title: `Заказ ${order.number}: ${atelierStatusLabel(status)}`,
        body: `${actor.name} изменил статус в ${formatTime(last.at)}`,
        href: `/orders/${order.number}`,
        dedupeKey: `order:${order.id}:status:${status}:${last.at}`,
      });
      if (n) created.push(n);
    }
    return { ...order };
  });
  await deliverPush(created);
  return order;
}

export function listWorkshopOrders(companyId: string) {
  const data = getData();
  const clients = new Map(data.clients.map((c) => [c.id, c.fullName]));
  return data.orders
    .filter(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.status === "awaiting" || o.status === "in_work" || o.status === "completed"),
    )
    .sort((a, b) =>
      (b.sewingOrderAt ?? b.updatedAt).localeCompare(a.sewingOrderAt ?? a.updatedAt),
    )
    .map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status as AtelierOrderStatus,
      clientName: clients.get(o.clientId) ?? o.atelierQuote?.clientName ?? "Клиент",
      address: o.address ?? null,
      deadline: o.deadline,
      summary: workSummary(o),
      sewingOrderAt: o.sewingOrderAt ?? null,
      acceptedBy: o.acceptedBy ?? null,
      acceptedAt: o.acceptedAt ?? null,
      completedAt:
        o.status === "completed"
          ? ([...(o.statusHistory ?? [])].reverse().find((h) => h.status === "completed")?.at ??
            o.updatedAt)
          : null,
    }));
}

/** Pure check used by tests: who may accept. */
export function canAcceptOrder(order: Pick<Order, "status" | "acceptedBy">): boolean {
  return order.status === "awaiting" && !order.acceptedBy;
}

/**
 * Badge for the «Цех» menu item: unread "new order" notifications of this user
 * whose order is still waiting in the queue. Cancelled or accepted orders drop out.
 */
export function workshopBadgeCount(data: AppData, companyId: string, userId: string): number {
  const awaiting = new Set(
    data.orders
      .filter((o) => o.companyId === companyId && isActiveOrder(o) && o.status === "awaiting")
      .map((o) => o.number),
  );
  const seen = new Set<string>();
  for (const n of data.notifications) {
    if (n.companyId !== companyId || n.read || n.type !== "workshop_new") continue;
    if (n.userId !== userId && n.userId !== null) continue;
    const number = n.href?.match(/[?&]order=([^&]+)/)?.[1];
    const key = number ? decodeURIComponent(number) : null;
    if (key && awaiting.has(key)) seen.add(key);
  }
  return seen.size;
}

/** Pure check: a sent order can be cancelled until it is completed. */
export function canCancelWorkshopOrder(order: Pick<Order, "status">): boolean {
  return order.status === "awaiting" || order.status === "in_work";
}

/**
 * The manager withdraws an order from the workshop: status becomes "cancelled"
 * (nothing is deleted), it leaves the queue and seamstresses are notified.
 */
export async function cancelWorkshopOrder(
  companyId: string,
  orderId: string,
  actor: WorkshopActor,
): Promise<Order> {
  const created: Notification[] = [];
  const order = mutateDataLocked((data): Order => {
    const order = findOrder(data, companyId, orderId);
    if (!canCancelWorkshopOrder(order)) {
      throw new WorkshopError(
        `Заказ нельзя отменить: статус «${atelierStatusLabel(order.status)}»`,
        409,
        { ...order },
      );
    }
    const at = nowIso();
    const acceptedBy = order.acceptedBy ?? null;
    recordStatus(order, "cancelled", actor, at);
    order.cancelledAt = at;
    logActivity(data, order, actor, `Отменил заказ ${order.number} в швейном цехе`);

    const recipients = new Map(workshopRecipients(data, companyId).map((u) => [u.id, u]));
    if (acceptedBy && !recipients.has(acceptedBy.userId)) {
      const u = activeUsers(data, companyId).find((x) => x.id === acceptedBy.userId);
      if (u) recipients.set(u.id, u);
    }
    recipients.delete(actor.id);
    for (const u of recipients.values()) {
      const n = addNotificationInData(data, {
        companyId,
        userId: u.id,
        type: "workshop_cancelled",
        title: `Заказ ${order.number} отменён`,
        body: `${actor.name} отменил(а) заказ ${order.number} (${clientName(data, order)}). Шить не нужно.`,
        href: `/workshop?order=${order.number}`,
        dedupeKey: `order:${order.id}:cancelled:${at}`,
      });
      if (n) created.push(n);
    }
    return { ...order };
  });
  await deliverPush(created);
  return order;
}
