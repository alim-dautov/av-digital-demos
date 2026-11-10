import type { Order } from "@/types";

/** False for soft-deleted orders: they stay only in finance and cash history. */
export function isActiveOrder(order: Pick<Order, "deletedAt">): boolean {
  return !order.deletedAt;
}
