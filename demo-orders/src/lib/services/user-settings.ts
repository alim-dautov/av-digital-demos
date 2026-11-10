import { getData, mutateDataLocked } from "@/lib/db";
import { nowIso } from "@/lib/utils";
import type { NotificationPreferenceKey, UserSettings } from "@/types";

const DEFAULTS: Record<NotificationPreferenceKey, boolean> = {
  workshop: true,
  orders: true,
  tasks: true,
  payroll: true,
  system: true,
};

export function getUserSettings(companyId: string, userId: string): UserSettings {
  return (
    getData().userSettings.find((s) => s.companyId === companyId && s.userId === userId) ?? {
      companyId,
      userId,
      notifications: { ...DEFAULTS },
      updatedAt: nowIso(),
    }
  );
}

export function updateUserNotificationSettings(
  companyId: string,
  userId: string,
  notifications: Partial<Record<NotificationPreferenceKey, boolean>>,
): UserSettings {
  return mutateDataLocked((data) => {
    const found = data.userSettings.find(
      (s) => s.companyId === companyId && s.userId === userId,
    );
    const next = {
      companyId,
      userId,
      notifications: { ...DEFAULTS, ...(found?.notifications ?? {}), ...notifications, system: true },
      updatedAt: nowIso(),
    } satisfies UserSettings;
    if (found) Object.assign(found, next);
    else data.userSettings.push(next);
    return next;
  });
}
