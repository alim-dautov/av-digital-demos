import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import {
  getColumnByKey,
  resolveProductionColumnKey,
  PRODUCTION_BOARD_COLUMNS,
} from "@/lib/production-board";
import { stageLabel, type Order, type OrderStage, type ProductionStageKey } from "@/types";
import type { Actor } from "@/lib/services/orders";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type BoardCard = {
  orderId: string;
  orderNumber: string;
  clientName: string;
  description: string;
  amount: number;
  deadline: string;
  stageId: string;
  stageKey: ProductionStageKey;
  stageLabel: string;
  stageStatus: OrderStage["status"];
  columnKey: string;
};

export function buildProductionBoard(companyId: string): {
  columns: { key: string; label: string; count: number }[];
  cards: BoardCard[];
} {
  const data = getData();
  const orders = data.orders.filter((o) => o.companyId === companyId && isActiveOrder(o));
  const stages = data.orderStages.filter((s) => s.companyId === companyId);
  const clients = data.clients.filter((c) => c.companyId === companyId);
  const clientName = (id: string) =>
    clients.find((c) => c.id === id)?.fullName ?? "Клиент";

  const cards: BoardCard[] = [];
  const placed = new Set<string>();

  for (const order of orders) {
    if (order.status === "closed" || order.status === "lead") continue;
    const orderStages = stages
      .filter((s) => s.orderId === order.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const active =
      orderStages.find((s) => s.status === "in_progress") ??
      orderStages.find((s) => s.status === "pending");

    if (!active) continue;
    const columnKey = resolveProductionColumnKey(active.key);
    if (!columnKey || placed.has(order.id)) continue;
    placed.add(order.id);
    cards.push({
      orderId: order.id,
      orderNumber: order.number,
      clientName: clientName(order.clientId),
      description: order.description,
      amount: order.amount,
      deadline: order.deadline,
      stageId: active.id,
      stageKey: active.key,
      stageLabel: active.label,
      stageStatus: active.status,
      columnKey,
    });
  }

  for (const stage of stages) {
    if (stage.status !== "in_progress" && stage.status !== "pending") continue;
    if (placed.has(stage.orderId)) continue;
    const order = orders.find((o) => o.id === stage.orderId);
    if (!order || order.status === "closed" || order.status === "lead") continue;
    const columnKey = resolveProductionColumnKey(stage.key);
    if (!columnKey) continue;
    placed.add(order.id);
    cards.push({
      orderId: order.id,
      orderNumber: order.number,
      clientName: clientName(order.clientId),
      description: order.description,
      amount: order.amount,
      deadline: order.deadline,
      stageId: stage.id,
      stageKey: stage.key,
      stageLabel: stage.label,
      stageStatus: stage.status,
      columnKey,
    });
  }

  const columns = PRODUCTION_BOARD_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    count: cards.filter((c) => c.columnKey === col.key).length,
  }));

  return { columns, cards };
}

function nextSortOrder(stages: OrderStage[]): number {
  if (!stages.length) return 1;
  return Math.max(...stages.map((s) => s.sortOrder)) + 1;
}

/**
 * Move order to a production board column.
 * Completes earlier stages, activates target, resets later in-progress to pending.
 */
export function moveOrderToProductionColumn(
  companyId: string,
  orderId: string,
  columnKey: string,
  actor: Actor,
): { order: Order; stage: OrderStage } | null {
  const col = getColumnByKey(columnKey);
  if (!col) throw new Error("Неизвестный этап");

  let result: { order: Order; stage: OrderStage } | null = null;

  mutateData((data) => {
    const order = data.orders.find(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.id === orderId || o.number === orderId),
    );
    if (!order) return;

    let stages = data.orderStages
      .filter((s) => s.companyId === companyId && s.orderId === order.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let target =
      stages.find((s) => col.stageKeys.includes(s.key)) ?? null;

    if (!target) {
      const key = col.stageKeys[0];
      const created: OrderStage = {
        id: generateId("ost"),
        companyId,
        orderId: order.id,
        key,
        label: stageLabel(
          key,
          data.settings.find((s) => s.companyId === companyId)?.productionStages,
        ),
        sortOrder: nextSortOrder(stages),
        status: "pending",
        responsibleId: order.masterId,
        startDate: null,
        endDate: null,
        durationHours: null,
        comment: null,
        media: [],
      };
      data.orderStages.push(created);
      stages = [...stages, created].sort((a, b) => a.sortOrder - b.sortOrder);
      target = created;
    }

    const today = todayDate();
    const targetSort = target.sortOrder;

    for (const s of data.orderStages) {
      if (s.companyId !== companyId || s.orderId !== order.id) continue;
      if (s.sortOrder < targetSort) {
        if (s.status !== "done") {
          s.status = "done";
          if (!s.endDate) s.endDate = today;
        }
      } else if (s.id === target!.id) {
        s.status = "in_progress";
        if (!s.startDate) s.startDate = today;
        s.endDate = null;
      } else if (s.status === "in_progress") {
        s.status = "pending";
      }
    }

    if (columnKey === "installation") {
      order.status = "installation";
    } else if (
      order.status !== "production" &&
      order.status !== "installation" &&
      order.status !== "closed"
    ) {
      order.status = "production";
    }
    order.updatedAt = nowIso();

    const freshTarget = data.orderStages.find((s) => s.id === target!.id)!;

    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Переместил заказ №${order.number} на этап «${col.label}»`,
      entityType: "order",
      entityId: order.id,
      createdAt: nowIso(),
    });

    result = { order: { ...order }, stage: { ...freshTarget } };
  });

  return result;
}
