import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { notifications, users } from "@/db/schema";
import { sendPush } from "@/lib/push";

export const NOTIFY_TYPES = {
  task_new: "Новая задача",
  task_status: "Смена статуса задачи",
  task_comment: "Комментарий в задаче",
  task_due: "Приближается срок задачи",
  task_overdue: "Просрочена задача",
  lead_new: "Новый лид",
  lead_stale: "Лид завис",
  lead_followup: "Напоминание по лиду",
  order_status: "Заявка сменила статус",
  debt_limit: "Превышен лимит долга",
  negative_stock: "Отрицательный остаток",
  payroll: "Зарплата (расчёт, закрытие, выплата)",
} as const;
export type NotifyType = keyof typeof NOTIFY_TYPES;

export async function notify(db: DB, userIds: (number | null | undefined)[], n: { type: NotifyType; title: string; body?: string; link?: string; excludeUserId?: number }) {
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === "number" && x !== n.excludeUserId))];
  if (!ids.length) return;
  const rows = await db.select({ id: users.id, prefs: users.notifyPrefs }).from(users).where(and(inArray(users.id, ids), eq(users.active, true)));
  const targets = rows.filter((r) => r.prefs[n.type] !== false);
  if (!targets.length) return;
  await db.insert(notifications).values(targets.map((t) => ({ userId: t.id, type: n.type, title: n.title, body: n.body ?? "", link: n.link ?? null })));
  // push — не блокируем основной поток ошибками
  await Promise.all(targets.filter((t) => t.prefs[`push_${n.type}`] !== false).map((t) => sendPush(db, t.id, { title: n.title, body: n.body ?? "", link: n.link, tag: n.type }).catch(() => {})));
}

export async function listNotifications(db: DB, userId: number, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function unreadCount(db: DB, userId: number) {
  const [r] = await db.select({ c: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.c ?? 0;
}
export async function markRead(db: DB, userId: number, id?: number) {
  const where = id ? and(eq(notifications.userId, userId), eq(notifications.id, id)) : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
