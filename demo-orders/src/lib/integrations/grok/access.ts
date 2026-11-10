import { isTextilesCompany } from "@/lib/company";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";
import { can } from "@/lib/rbac";
import { orderVisibleInList } from "@/lib/services/atelier-orders";
import { canAccessCompany, toSessionUser } from "@/lib/session-user";
import type { AppData, Order, SessionUser } from "@/types";
import { GrokCommandError } from "./errors";

/** The bot acts strictly as this user: same company, role and per-module overrides. */
export function resolveActor(
  data: AppData,
  actorUserId: string,
  companyId?: string | null,
): SessionUser {
  const user = data.users.find((u) => u.id === actorUserId && u.isActive);
  if (!user) throw new GrokCommandError("Пользователь не найден или отключён", 403, "denied");
  const target = companyId ?? user.companyId;
  if (!canAccessCompany(user, target) || !data.companies.some((c) => c.id === target)) {
    throw new GrokCommandError("Нет доступа к компании", 403, "denied");
  }
  if (!isTextilesCompany(target)) {
    throw new GrokCommandError("Коннектор доступен только для «Шторы Демо»", 400, "denied");
  }
  return { ...toSessionUser(user, target), disabledModules: data.companies.find((c) => c.id === target)?.disabledModules ?? [] };
}

/** Same visibility as the orders list: masters see their own orders, seamstresses only sewing. */
export function canSeeOrder(
  actor: SessionUser,
  order: Pick<Order, "masterId" | "masterIds" | "sewingOrderAt" | "proposalId" | "deletedAt">,
): boolean {
  if (!isActiveOrder(order)) return false;
  if (!can(actor, "orders", "read")) return false;
  if (actor.role === "MASTER" && actor.employeeId && order.masterId !== actor.employeeId && !order.masterIds?.includes(actor.employeeId)) {
    return false;
  }
  return orderVisibleInList(order, actor.role);
}

export function hidesMoney(actor: SessionUser): boolean {
  return actor.role === "SEAMSTRESS";
}

export function findVisibleOrder(data: AppData, actor: SessionUser, idOrNumber: string): Order {
  const key = idOrNumber.trim();
  const order = data.orders.find(
    (o) => o.companyId === actor.companyId && (o.id === key || o.number === key),
  );
  if (!order || !canSeeOrder(actor, order)) {
    throw new GrokCommandError("Заказ не найден", 404, "denied");
  }
  return order;
}
