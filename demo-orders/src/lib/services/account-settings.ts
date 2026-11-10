import bcrypt from "bcryptjs";
import { getData, mutateDataLocked } from "@/lib/db";
import type { NotificationPrefs, NotificationType, UserAccount } from "@/types";

/** Short enough for «Name123», long enough not to be trivial. */
export const SELF_PASSWORD_MIN = 6;
export const SELF_PASSWORD_MAX = 128;

export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

/** Types a user may switch off; service types like "test" always arrive. */
export const CONFIGURABLE_NOTIFICATION_TYPES: { type: NotificationType; label: string }[] = [
  { type: "new_order", label: "Новые заказы" },
  { type: "status_change", label: "Смена статуса заказа" },
  { type: "stage_change", label: "Этапы производства" },
  { type: "task_assigned", label: "Новые задачи" },
  { type: "task_overdue", label: "Просроченные задачи" },
  { type: "lateness", label: "Опоздания" },
  { type: "low_stock", label: "Мало на складе" },
  { type: "new_report", label: "Отчёты сотрудников" },
  { type: "new_advance", label: "Авансы" },
  { type: "sewing_order", label: "Заказы на пошив" },
  { type: "workshop_new", label: "Новые заказы в цех" },
  { type: "workshop_accepted", label: "Цех принял заказ" },
  { type: "workshop_cancelled", label: "Отмена заказа в цехе" },
  { type: "assistant", label: "Ассистент" },
];

const CONFIGURABLE = new Set(CONFIGURABLE_NOTIFICATION_TYPES.map((t) => t.type));

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { push: true, muted: [] };

export function notificationPrefsOf(
  user: Pick<UserAccount, "notificationPrefs"> | null | undefined,
): NotificationPrefs {
  const p = user?.notificationPrefs;
  if (!p) return { ...DEFAULT_NOTIFICATION_PREFS, muted: [] };
  return {
    push: p.push !== false,
    muted: Array.isArray(p.muted) ? p.muted.filter((t) => CONFIGURABLE.has(t)) : [],
  };
}

export function isTypeMuted(prefs: NotificationPrefs, type: NotificationType): boolean {
  return CONFIGURABLE.has(type) && prefs.muted.includes(type);
}

/** Whether a notification of this type should be pushed to this user's devices. */
export function pushAllowed(prefs: NotificationPrefs, type: NotificationType): boolean {
  if (type === "test") return true;
  return prefs.push && !isTypeMuted(prefs, type);
}

export function getNotificationPrefs(userId: string): NotificationPrefs {
  return notificationPrefsOf(getData().users.find((u) => u.id === userId));
}

export async function updateNotificationPrefs(
  userId: string,
  input: { push: boolean; muted: NotificationType[] },
): Promise<NotificationPrefs> {
  const muted = [...new Set(input.muted)].filter((t) => CONFIGURABLE.has(t));
  return mutateDataLocked((data) => {
    const user = data.users.find((u) => u.id === userId);
    if (!user) throw new AccountError("Пользователь не найден", 404);
    user.notificationPrefs = { push: input.push, muted };
    return notificationPrefsOf(user);
  });
}

export function validateNewPassword(next: string, confirm: string): void {
  if (next.length < SELF_PASSWORD_MIN) {
    throw new AccountError(`Новый пароль — не короче ${SELF_PASSWORD_MIN} символов`);
  }
  if (next.length > SELF_PASSWORD_MAX) {
    throw new AccountError("Слишком длинный пароль");
  }
  if (next.trim() !== next) {
    throw new AccountError("Пароль не должен начинаться или заканчиваться пробелом");
  }
  if (next !== confirm) {
    throw new AccountError("Пароли не совпадают");
  }
}

/** The user changes their own password; the current one must match. */
export async function changeOwnPassword(
  userId: string,
  input: { current: string; next: string; confirm: string },
): Promise<void> {
  validateNewPassword(input.next, input.confirm);
  const user = getData().users.find((u) => u.id === userId);
  if (!user || !user.isActive) throw new AccountError("Пользователь не найден", 404);
  const ok = await bcrypt.compare(input.current, user.passwordHash);
  if (!ok) throw new AccountError("Текущий пароль неверный", 403);
  if (input.current === input.next) {
    throw new AccountError("Новый пароль совпадает с текущим");
  }
  const hash = await bcrypt.hash(input.next, 12);
  await mutateDataLocked((data) => {
    const u = data.users.find((x) => x.id === userId);
    if (!u) throw new AccountError("Пользователь не найден", 404);
    u.passwordHash = hash;
    u.sessionVersion = (u.sessionVersion ?? 0) + 1;
  });
}
