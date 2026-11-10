import { getData, mutateDataLocked } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type {
  Order,
  OrderAuditLog,
  OrderStage,
  AtelierRoom,
  AtelierStoredQuote,
  ProductionMaterial,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type TextileProductionChange = {
  roomId: string;
  collection: "tulle" | "portiere" | "covers" | "pillows" | "cornices" | "rollers";
  lineId: string;
  field: string;
  value: string | number | boolean | null;
};

export type OperationalProductionChange =
  | { target: "stage"; id: string; field: "status" | "comment"; value: string | null }
  | { target: "checklist"; id: string; field: "done" | "quantity" | "comment"; value: string | number | boolean | null }
  | { target: "order"; id?: never; field: "productionComment"; value: string | null }
  | { target: "materials"; id?: never; field: "list"; value: string };

export type ProductionChange = TextileProductionChange | OperationalProductionChange;

export type ProductionActor = { id: string; name: string };

export class ProductionOrderError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 = 400) {
    super(message);
  }
}

const FIELD_LABELS: Record<string, string> = {
  meterage: "Расход ткани",
  metersNeeded: "Расчётный расход",
  width: "Ширина",
  height: "Высота",
  length: "Длина",
  overhang: "Свес",
  quantity: "Количество",
  meters: "Метраж",
  sewingMeters: "Метраж пошива",
  note: "Комментарий",
};

const ALLOWED: Record<TextileProductionChange["collection"], string[]> = {
  tulle: ["meterage", "metersNeeded", "width", "height", "note", "sewing.meters"],
  portiere: ["meterage", "metersNeeded", "width", "height", "note", "sewing.meters"],
  covers: ["width", "length", "overhang", "note"],
  pillows: ["width", "height", "quantity", "note"],
  cornices: ["meters", "note"],
  rollers: ["width", "height", "note"],
};

function findOrder(data: ReturnType<typeof getData>, companyId: string, idOrNumber: string): Order {
  const order = data.orders.find(
    (item) => item.companyId === companyId && isActiveOrder(item) && (item.id === idOrNumber || item.number === idOrNumber),
  );
  if (!order) throw new ProductionOrderError("Заказ не найден", 404);
  return order;
}

function lineInQuote(quote: AtelierStoredQuote, change: TextileProductionChange): Record<string, unknown> {
  const room = (quote.rooms ?? []).find((item) => item.id === change.roomId) as AtelierRoom | undefined;
  if (!room) throw new ProductionOrderError("Комната заказа не найдена", 404);
  const line = (room[change.collection] as unknown as Array<Record<string, unknown>> | undefined)?.find(
    (item) => item.id === change.lineId,
  );
  if (!line) throw new ProductionOrderError("Производственная позиция не найдена", 404);
  return line;
}

function getValue(line: Record<string, unknown>, field: string): string | number | boolean | null {
  if (field === "sewing.meters") {
    const sewing = line.sewing as Record<string, unknown> | undefined;
    return typeof sewing?.meters === "number" ? sewing.meters : null;
  }
  const value = line[field];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null ? value : null;
}

function setValue(line: Record<string, unknown>, field: string, value: string | number | boolean | null) {
  if (field === "sewing.meters") {
    const sewing = (line.sewing as Record<string, unknown> | undefined) ?? {};
    sewing.meters = value;
    line.sewing = sewing;
  } else {
    line[field] = value;
  }
}

function productionAudit(
  data: ReturnType<typeof getData>,
  order: Order,
  actor: ProductionActor,
  field: string,
  previousValue: string | number | boolean | null,
  nextValue: string | number | boolean | null,
  reason: string | null | undefined,
  createdAt: string,
) {
  if (previousValue === nextValue) return;
  data.orderAuditLogs.unshift({
    id: generateId("audit"),
    companyId: order.companyId,
    orderId: order.id,
    actorId: actor.id,
    actorName: actor.name,
    field,
    previousValue,
    nextValue,
    reason: reason?.trim() || null,
    createdAt,
  });
}

function parseMaterials(value: string): ProductionMaterial[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new ProductionOrderError("Некорректный список материалов");
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw new ProductionOrderError("Некорректный список материалов");
  }
  return parsed.map((item, index) => {
    const row = item as Partial<ProductionMaterial>;
    const quantity = Number(row.quantity);
    if (!String(row.name ?? "").trim() || !Number.isFinite(quantity) || quantity < 0) {
      throw new ProductionOrderError(`Некорректный материал №${index + 1}`);
    }
    return {
      id: String(row.id || generateId("pmat")),
      name: String(row.name).trim().slice(0, 200),
      quantity,
      unit: String(row.unit || "шт").trim().slice(0, 30),
      comment: row.comment == null ? null : String(row.comment).trim().slice(0, 500),
    };
  });
}

export function updateProductionData(
  companyId: string,
  orderId: string,
  changes: ProductionChange[],
  actor: ProductionActor,
  expectedUpdatedAt?: string,
  reason?: string | null,
) {
  return mutateDataLocked((data) => {
    const order = findOrder(data, companyId, orderId);
    if (expectedUpdatedAt && order.updatedAt !== expectedUpdatedAt) {
      throw new ProductionOrderError("Заказ уже обновился у другого сотрудника. Обновите карточку и повторите сохранение.", 409);
    }
    if (!changes.length || changes.length > 100) throw new ProductionOrderError("Нет изменений для сохранения", 400);
    const at = nowIso();
    for (const change of changes) {
      if ("collection" in change) {
        if (!order.atelierQuote?.rooms) throw new ProductionOrderError("В заказе нет производственных данных", 400);
        if (!ALLOWED[change.collection]?.includes(change.field)) {
          throw new ProductionOrderError(`Поле «${change.field}» нельзя изменять в цехе`, 400);
        }
        const line = lineInQuote(order.atelierQuote, change);
        const previousValue = getValue(line, change.field);
        if (typeof change.value === "number" && (!Number.isFinite(change.value) || change.value < 0)) {
          throw new ProductionOrderError("Числовые значения должны быть неотрицательными", 400);
        }
        setValue(line, change.field, change.value);
        productionAudit(data, order, actor, `${change.collection}.${FIELD_LABELS[change.field] ?? change.field}`, previousValue, change.value, reason, at);
        continue;
      }

      if (change.target === "stage") {
        const stage = data.orderStages.find((item) => item.id === change.id && item.orderId === order.id);
        if (!stage) throw new ProductionOrderError("Этап заказа не найден", 404);
        if (change.field === "status") {
          if (!["pending", "in_progress", "done", "blocked"].includes(change.value ?? "")) {
            throw new ProductionOrderError("Некорректный статус этапа");
          }
          const previousValue = stage.status;
          stage.status = change.value as OrderStage["status"];
          productionAudit(data, order, actor, `stage.${stage.label}.status`, previousValue, stage.status, reason, at);
        } else {
          const previousValue = stage.comment;
          stage.comment = change.value;
          productionAudit(data, order, actor, `stage.${stage.label}.comment`, previousValue, stage.comment, reason, at);
        }
        continue;
      }

      if (change.target === "checklist") {
        const item = data.checklistItems.find((entry) => entry.id === change.id && entry.orderId === order.id);
        if (!item) throw new ProductionOrderError("Пункт чек-листа не найден", 404);
        const previousValue = item[change.field] as string | number | boolean | null;
        if (change.field === "done") item.done = Boolean(change.value);
        if (change.field === "quantity") {
          const quantity = Number(change.value);
          if (!Number.isFinite(quantity) || quantity < 0) throw new ProductionOrderError("Количество должно быть неотрицательным");
          item.quantity = quantity;
        }
        if (change.field === "comment") item.comment = change.value == null ? null : String(change.value).slice(0, 500);
        productionAudit(data, order, actor, `checklist.${item.name}.${change.field}`, previousValue, item[change.field] as string | number | boolean | null, reason, at);
        continue;
      }

      if (change.target === "order") {
        const previousValue = order.productionComment ?? null;
        order.productionComment = change.value;
        productionAudit(data, order, actor, "order.productionComment", previousValue, order.productionComment, reason, at);
        continue;
      }

      const previousValue = JSON.stringify(order.productionMaterials ?? []);
      const nextMaterials = parseMaterials(change.value);
      order.productionMaterials = nextMaterials;
      productionAudit(data, order, actor, "order.productionMaterials", previousValue, JSON.stringify(nextMaterials), reason, at);
    }
    order.updatedAt = at;
    data.activityLog.unshift({
      id: generateId("act"),
      companyId,
      actorId: actor.id,
      actorName: actor.name,
      action: `Изменил производственные данные заказа №${order.number}`,
      entityType: "order",
      entityId: order.id,
      createdAt: at,
    });
    return { order: { ...order }, audit: data.orderAuditLogs.filter((entry) => entry.orderId === order.id) };
  });
}

export function listOrderAudit(companyId: string, orderId: string): OrderAuditLog[] {
  return getData().orderAuditLogs
    .filter((entry) => entry.companyId === companyId && entry.orderId === orderId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
