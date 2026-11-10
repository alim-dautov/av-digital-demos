import type { NotificationPreferenceKey } from "@/types";

export const NOTIFICATION_PREFERENCE_LABELS: Record<NotificationPreferenceKey, string> = {
  workshop: "Заказы и события цеха",
  orders: "Изменения заказов",
  tasks: "Задачи и сроки",
  payroll: "Зарплата и авансы",
  system: "Системные уведомления",
};
