import { getData, mutateDataLocked } from "@/lib/db";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { orderPrepayment } from "@/lib/domain/order-money";
import {
  orderHrefMatches,
  orderKeyMatches,
  type OrderKeys,
} from "@/lib/services/order-cascade";
import { generateId, nowIso } from "@/lib/utils";
import type { AppData, Order } from "@/types";

export class OrderDeletionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

/**
 * Orders are never erased: deletion hides the order (`deletedAt` + who) from lists, analytics,
 * workshop and payroll. `archived` means it also has money, payroll or stock history that stays
 * in the books; `deleted` means it had none.
 */
export type DeletionMode = "deleted" | "archived";

export type DeletionSummary = {
  id: string;
  number: string;
  status: string;
  mode: DeletionMode;
  quote: { rooms: number } | null;
  proposals: number;
  measurements: number;
  expenses: { count: number; amount: number };
  cash: { count: number; amount: number };
  payroll: number;
  stockMovements: number;
  sewing: { sentAt: string | null; acceptedBy: string | null; history: number };
  tasks: number;
  notifications: number;
};

export type DeletionActor = { id: string; name: string };

function keysOf(order: Order): OrderKeys {
  return { ids: new Set([order.id]), numbers: new Set([order.number]) };
}

function findActiveOrder(data: AppData, companyId: string, idOrNumber: string): Order {
  const order = data.orders.find(
    (o) => o.companyId === companyId && (o.id === idOrNumber || o.number === idOrNumber),
  );
  if (!order || !isActiveOrder(order)) throw new OrderDeletionError("Заказ уже удалён", 404);
  return order;
}

function summarize(data: AppData, order: Order): DeletionSummary {
  const keys = keysOf(order);
  const inCompany = <T extends { companyId: string }>(rows: T[]) =>
    rows.filter((r) => r.companyId === order.companyId);
  const linked = <T extends { companyId: string; orderId?: string | null }>(rows: T[]) =>
    inCompany(rows).filter((r) => orderKeyMatches(keys, r.orderId));

  const expenses = linked(data.orderExpenses);
  const cash = linked(data.cashEntries);
  const payroll = linked(data.salaries).length + linked(data.advances).length;
  const stockMovements = linked(data.inventoryMovements).length;
  const unbookedMoney = orderPrepayment(order) > 0 || (order.payments?.length ?? 0) > 0;
  const hasHistory =
    expenses.length > 0 || cash.length > 0 || payroll > 0 || stockMovements > 0 || unbookedMoney;

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    mode: hasHistory ? "archived" : "deleted",
    quote: order.atelierQuote ? { rooms: order.atelierQuote.rooms?.length ?? 0 } : null,
    proposals: inCompany(data.commercialProposals).filter(
      (p) => orderKeyMatches(keys, p.orderId) || order.proposalId === p.id,
    ).length,
    measurements: linked(data.measurements).length,
    expenses: { count: expenses.length, amount: expenses.reduce((s, e) => s + e.amount, 0) },
    cash: {
      count: cash.length,
      amount: cash.reduce((s, e) => s + (e.type === "in" ? e.amount : -e.amount), 0),
    },
    payroll,
    stockMovements,
    sewing: {
      sentAt: order.sewingOrderAt ?? null,
      acceptedBy: order.acceptedBy?.name ?? null,
      history: order.statusHistory?.length ?? 0,
    },
    tasks: linked(data.tasks).length,
    notifications: inCompany(data.notifications).filter((n) => orderHrefMatches(keys, n.href)).length,
  };
}

export function getDeletionSummary(companyId: string, idOrNumber: string): DeletionSummary {
  const data = getData();
  return summarize(data, findActiveOrder(data, companyId, idOrNumber));
}

/**
 * Soft-deletes an order after the user retyped its number. Nothing is erased, so finance
 * reports and the cash balance do not change.
 * A repeated call finds nothing and fails with 404, so a double submit changes nothing.
 */
export function deleteOrder(
  companyId: string,
  idOrNumber: string,
  actor: DeletionActor,
  confirmNumber: string,
): { mode: DeletionMode; number: string } {
  return mutateDataLocked((data) => {
    const order = findActiveOrder(data, companyId, idOrNumber);
    if (confirmNumber.trim() !== order.number) {
      throw new OrderDeletionError("Номер заказа введён неверно", 400);
    }
    const { mode } = summarize(data, order);
    const keys = keysOf(order);
    const at = nowIso();

    order.deletedAt = at;
    order.deletedBy = { userId: actor.id, name: actor.name };
    order.updatedAt = at;
    data.tasks = data.tasks.filter(
      (t) => t.companyId !== companyId || t.status === "done" || !orderKeyMatches(keys, t.orderId),
    );
    data.notifications = data.notifications.filter(
      (n) => n.companyId !== companyId || !orderHrefMatches(keys, n.href),
    );

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action:
        mode === "deleted"
          ? `Заказ ${order.number} удалён`
          : `Заказ ${order.number} удалён, финансовые записи сохранены`,
      entityType: "order",
      entityId: order.id,
      createdAt: at,
    });
    return { mode, number: order.number };
  });
}
