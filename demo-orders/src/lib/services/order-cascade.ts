import type { AppData } from "@/types";

/** Ids and numbers of orders: older records sometimes reference an order by its number. */
export type OrderKeys = { ids: Set<string>; numbers: Set<string> };

export function orderKeyMatches(keys: OrderKeys, ref: string | null | undefined): boolean {
  return ref != null && (keys.ids.has(ref) || keys.numbers.has(ref));
}

/** Matches `/orders/<key>` and `...?order=<key>` links. */
export function orderHrefMatches(keys: OrderKeys, href: string | null | undefined): boolean {
  if (!href) return false;
  const [pathPart, query = ""] = href.split("?");
  if (orderKeyMatches(keys, pathPart.split("/").pop())) return true;
  return orderKeyMatches(keys, new URLSearchParams(query).get("order"));
}

/**
 * Removes records that exist only for the order's work: stages, checklist,
 * employee reports, tasks and notifications. Money, stock and client documents are left alone.
 */
export function dropOrderWorkRecords(data: AppData, companyId: string, keys: OrderKeys): void {
  const other = (row: { companyId: string }) => row.companyId !== companyId;
  data.orderStages = data.orderStages.filter((x) => other(x) || !orderKeyMatches(keys, x.orderId));
  data.checklistItems = data.checklistItems.filter(
    (x) => other(x) || !orderKeyMatches(keys, x.orderId),
  );
  data.reports = data.reports.filter((x) => other(x) || !orderKeyMatches(keys, x.orderId));
  data.tasks = data.tasks.filter((t) => other(t) || !orderKeyMatches(keys, t.orderId));
  data.notifications = data.notifications.filter(
    (n) => other(n) || !orderHrefMatches(keys, n.href),
  );
}
