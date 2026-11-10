import { getData, mutateData } from "@/lib/db";
import { deliverPush } from "@/lib/push";
import { generateId, nowIso } from "@/lib/utils";
import { isTypeMuted, notificationPrefsOf } from "@/lib/services/account-settings";
import type {
  AppData,
  Notification,
  NotificationPreferenceKey,
  NotificationType,
} from "@/types";

export type NotificationInput = {
  companyId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string | null;
  /** The same key for the same recipient is stored and pushed only once */
  dedupeKey?: string | null;
  /** Mandatory system notifications ignore personal preferences. */
  mandatory?: boolean;
};

const DEFAULT_PREFERENCES: Record<NotificationPreferenceKey, boolean> = {
  workshop: true,
  orders: true,
  tasks: true,
  payroll: true,
  system: true,
};

function preferenceFor(type: NotificationType): NotificationPreferenceKey {
  if (type === "workshop_new" || type === "workshop_accepted" || type === "sewing_order") {
    return "workshop";
  }
  if (type === "new_order" || type === "status_change") return "orders";
  if (type === "task_assigned" || type === "task_overdue") return "tasks";
  if (type === "new_advance") return "payroll";
  return "system";
}

export function listNotifications(
  companyId: string,
  userId?: string | null,
): Notification[] {
  const data = getData();
  const prefs =
    userId == null ? null : notificationPrefsOf(data.users.find((u) => u.id === userId));
  return data.notifications
    .filter((n) => {
      if (n.companyId !== companyId) return false;
      if (userId == null) return true;
      if (n.userId !== userId && n.userId !== null) return false;
      return !prefs || !isTypeMuted(prefs, n.type);
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function markRead(
  companyId: string,
  notificationId: string,
  userId: string,
): boolean {
  let ok = false;
  mutateData((data) => {
    const n = data.notifications.find(
      (x) =>
        x.id === notificationId &&
        x.companyId === companyId &&
        (x.userId === null || x.userId === userId),
    );
    if (n) {
      n.read = true;
      ok = true;
    }
  });
  return ok;
}

export function markAllRead(companyId: string, userId?: string | null): number {
  let count = 0;
  mutateData((data) => {
    for (const n of data.notifications) {
      if (n.companyId !== companyId || n.read) continue;
      if (userId != null && n.userId !== userId && n.userId !== null) continue;
      n.read = true;
      count += 1;
    }
  });
  return count;
}

/** Marks the user's unread notifications of the given types as read. */
export function markReadByType(
  companyId: string,
  userId: string,
  types: NotificationType[],
): number {
  let count = 0;
  mutateData((data) => {
    for (const n of data.notifications) {
      if (n.companyId !== companyId || n.read || !types.includes(n.type)) continue;
      if (n.userId !== userId && n.userId !== null) continue;
      n.read = true;
      count += 1;
    }
  });
  return count;
}

export function unreadCount(
  companyId: string,
  userId?: string | null,
): number {
  return listNotifications(companyId, userId).filter((n) => !n.read).length;
}

/**
 * Adds a notification inside an open mutation. Returns null when a notification
 * with the same dedupe key already exists for this recipient.
 */
export function addNotificationInData(
  data: AppData,
  input: NotificationInput,
): Notification | null {
  const userId = input.userId ?? null;
  if (userId && !input.mandatory) {
    const prefs = (data.userSettings ?? []).find(
      (s) => s.userId === userId && s.companyId === input.companyId,
    )?.notifications;
    const key = preferenceFor(input.type);
    if (prefs && (prefs[key] ?? DEFAULT_PREFERENCES[key]) === false) return null;
  }
  const key = input.dedupeKey ?? null;
  if (
    key &&
    data.notifications.some(
      (n) => n.companyId === input.companyId && n.dedupeKey === key && n.userId === userId,
    )
  ) {
    return null;
  }
  const notification: Notification = {
    id: generateId("notif"),
    companyId: input.companyId,
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href ?? null,
    read: false,
    createdAt: nowIso(),
    dedupeKey: key,
  };
  data.notifications.unshift(notification);
  return notification;
}

/** Stores the notification and sends it as push. Duplicates by dedupe key are skipped. */
export async function createNotification(input: NotificationInput): Promise<Notification | null> {
  let created: Notification | null = null;
  mutateData((data) => {
    created = addNotificationInData(data, input);
  });
  if (created) await deliverPush([created]);
  return created;
}
