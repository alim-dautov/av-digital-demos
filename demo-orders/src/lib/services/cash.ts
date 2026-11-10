import { getData, mutateData } from "@/lib/db";
import { orderBalance, orderPaymentsTotal, orderPrepayment } from "@/lib/domain/order-money";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import type { CashEntry, Order } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export function listCashEntries(companyId: string): CashEntry[] {
  return getData()
    .cashEntries.filter((entry) => entry.companyId === companyId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.createdAt < b.createdAt ? 1 : -1));
}

export function cashBalance(companyId: string): number {
  return listCashEntries(companyId).reduce((sum, entry) => {
    return sum + (entry.type === "in" ? entry.amount : -entry.amount);
  }, 0);
}

export function addCashEntry(input: {
  companyId: string;
  date?: string;
  type: "in" | "out";
  amount: number;
  category: string;
  comment?: string | null;
  orderId?: string | null;
  purchaseId?: string | null;
  paymentId?: string | null;
  source: CashEntry["source"];
}): CashEntry {
  const amount = Math.round(Math.max(0, input.amount));
  if (!amount) throw new Error("Укажите сумму");
  const entry: CashEntry = {
    id: generateId("cash"),
    companyId: input.companyId,
    date: input.date || todayDate(),
    type: input.type,
    amount,
    category: input.category.trim() || (input.type === "in" ? "Приход" : "Расход"),
    comment: input.comment?.trim() || null,
    orderId: input.orderId ?? null,
    purchaseId: input.purchaseId ?? null,
    paymentId: input.paymentId ?? null,
    source: input.source,
    createdAt: nowIso(),
  };
  mutateData((data) => {
    data.cashEntries.unshift(entry);
  });
  return entry;
}

function pushCash(data: { cashEntries: CashEntry[] }, entry: CashEntry) {
  data.cashEntries.unshift(entry);
}

/** Синхронизирует предоплату с одной кассовой записью. */
export function syncPrepayment(
  data: { cashEntries: CashEntry[]; orders: Order[] },
  order: Order,
  amount: number,
) {
  const next = Math.round(Math.max(0, amount));
  order.prepayment = next;
  const current = data.cashEntries.find(
    (entry) => entry.orderId === order.id && entry.source === "prepayment",
  );
  if (current) {
    current.amount = next;
    current.date = todayDate();
    if (!next) {
      data.cashEntries = data.cashEntries.filter((entry) => entry.id !== current.id);
    }
    return;
  }
  if (!next) return;
  pushCash(data, {
    id: generateId("cash"),
    companyId: order.companyId,
    date: todayDate(),
    type: "in",
    amount: next,
    category: "Предоплата",
    comment: `Предоплата по заказу ${order.number}`,
    orderId: order.id,
    purchaseId: null,
    paymentId: null,
    source: "prepayment",
    createdAt: nowIso(),
  });
}

export function addOrderPayment(
  companyId: string,
  orderId: string,
  input: { amount: number; date?: string; comment?: string | null; prepayment?: number },
): Order {
  let result: Order | null = null;
  mutateData((data) => {
    const order = data.orders.find(
      (item) => item.id === orderId && item.companyId === companyId && isActiveOrder(item),
    );
    if (!order) throw new Error("Заказ не найден");
    if (!order.payments) order.payments = [];
    if (input.prepayment != null) syncPrepayment(data, order, input.prepayment);
    const amount = Math.round(Math.max(0, input.amount || 0));
    if (amount > 0) {
      const paymentId = generateId("pay");
      const cashId = generateId("cash");
      order.payments.push({
        id: paymentId,
        date: input.date || todayDate(),
        amount,
        comment: input.comment?.trim() || null,
        cashEntryId: cashId,
      });
      pushCash(data, {
        id: cashId,
        companyId,
        date: input.date || todayDate(),
        type: "in",
        amount,
        category: "Оплата заказа",
        comment: input.comment?.trim() || `Оплата по заказу ${order.number}`,
        orderId: order.id,
        purchaseId: null,
        paymentId,
        source: "payment",
        createdAt: nowIso(),
      });
    }
    order.updatedAt = nowIso();
    result = { ...order, payments: [...(order.payments ?? [])] };
  });
  if (!result) throw new Error("Заказ не найден");
  return result;
}

export function orderMoneyView(order: Order) {
  return {
    amount: order.amount,
    prepayment: orderPrepayment(order),
    paid: orderPaymentsTotal(order),
    balance: orderBalance(order),
  };
}
