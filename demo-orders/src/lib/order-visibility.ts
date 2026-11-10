import type { Client, Order, OrderWorkerVisibility, UserRole } from "@/types";

export const ORDER_VISIBILITY_FIELDS: {
  key: keyof OrderWorkerVisibility;
  label: string;
}[] = [
  { key: "amount", label: "Сумма заказа" },
  { key: "clientName", label: "Имя клиента" },
  { key: "clientPhone", label: "Телефон клиента" },
  { key: "address", label: "Адрес" },
  { key: "deadline", label: "Срок сдачи" },
  { key: "materials", label: "Материалы и фурнитура" },
  { key: "media", label: "Чертежи и файлы" },
  { key: "comments", label: "Комментарии" },
  { key: "stages", label: "Этапы производства" },
];

/** По умолчанию рабочий видит всё, кроме телефона клиента. Сумма — включена (прозрачность зарплаты). */
export const DEFAULT_ORDER_VISIBILITY: OrderWorkerVisibility = {
  amount: true,
  clientName: true,
  clientPhone: false,
  address: true,
  deadline: true,
  materials: true,
  media: true,
  comments: true,
  stages: true,
};

export function normalizeVisibility(
  v: Partial<OrderWorkerVisibility> | null | undefined,
): OrderWorkerVisibility {
  const out = { ...DEFAULT_ORDER_VISIBILITY };
  if (!v) return out;
  for (const { key } of ORDER_VISIBILITY_FIELDS) {
    if (typeof v[key] === "boolean") out[key] = v[key] as boolean;
  }
  return out;
}

export function visibilityOf(order: Pick<Order, "workerVisibility">): OrderWorkerVisibility {
  return normalizeVisibility(order.workerVisibility);
}

/** Роли, к которым применяются галочки видимости заказа (рабочие на заказе). */
export function isRestrictedOrderViewer(role: UserRole): boolean {
  return role === "MASTER" || role === "DRIVER";
}

type SanitizableOrder = Order & {
  client?: Client | null;
  stages?: unknown[];
  checklist?: unknown[];
};

/**
 * Убирает из заказа то, что рабочему видеть не положено. Себестоимость, прибыль
 * и сметы рабочему не отдаются никогда; сумма — только при включённой галочке.
 */
export function sanitizeOrderForWorker<T extends SanitizableOrder>(
  order: T,
  vis: OrderWorkerVisibility = visibilityOf(order),
): T {
  const out: T = { ...order, cost: 0, profit: 0 };
  const rec = out as unknown as Record<string, unknown>;
  for (const k of [
    "furnitureQuote",
    "atelierQuote",
    "renovationQuote",
    "payments",
    "prepayment",
    "costItems",
  ]) {
    if (k in rec) rec[k] = undefined;
  }
  if (!vis.amount) out.amount = 0;
  if (!vis.deadline) { out.deadline = ""; out.closedAt = null; }
  if (!vis.comments) {
    out.comment = null;
    rec.orderNotes = [];
  }
  if (!vis.materials) {
    out.materialsNote = null;
    out.hardwareNote = null;
    if (Array.isArray(out.checklist)) out.checklist = [];
  }
  if (!vis.media) {
    out.media = [];
    rec.orderNotes = [];
  }
  if (!vis.stages && Array.isArray(out.stages)) out.stages = [];
  if (!vis.address) {
    for (const k of ["address", "installAddress", "objectAddress"]) {
      if (k in rec) rec[k] = null;
    }
  }
  if (out.client) {
    if (!vis.clientName && !vis.clientPhone && !vis.address) {
      out.client = null;
    } else {
      const c: Client = { ...out.client };
      if (!vis.clientName) c.fullName = "Скрыто";
      if (!vis.clientPhone) {
        c.phone = "";
        c.whatsapp = null;
        c.email = null;
      }
      if (!vis.address) c.address = null;
      c.totalAmount = 0;
      c.ordersCount = 0;
      c.comment = null;
      out.client = c;
    }
  }
  return out;
}

/** Доля сборщика с заказа (для прозрачности зарплаты). */
export function workerShare(amount: number, percent: number): number {
  return Math.round((amount * percent) / 100);
}
