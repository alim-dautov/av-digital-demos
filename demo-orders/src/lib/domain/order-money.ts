import type { Order, OrderPayment } from "@/types";

export function orderPrepayment(order: Pick<Order, "prepayment">): number {
  const value = order.prepayment ?? 0;
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function orderPaymentsTotal(order: Pick<Order, "payments">): number {
  return (order.payments ?? []).reduce((sum, payment) => {
    const amount = payment.amount;
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
}

/** Остаток = сумма − предоплата − оплаты. */
export function orderBalance(order: Pick<Order, "amount" | "prepayment" | "payments">): number {
  return Math.round(order.amount - orderPrepayment(order) - orderPaymentsTotal(order));
}

export function activeAtelierOrder(status: string): boolean {
  return status !== "completed" && status !== "cancelled" && status !== "closed";
}

export type { OrderPayment };
