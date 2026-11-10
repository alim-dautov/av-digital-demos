import type { ModuleKey } from "@/lib/rbac";

export type NavItem = { href: string; label: string; icon: string; module?: ModuleKey; flag?: "payroll" };
export type NavGroup = { title: string; items: NavItem[] };

/** Навигация. Пункты скрываются, если нет права хотя бы на просмотр. */
export const NAV: NavGroup[] = [
  { title: "", items: [{ href: "/", label: "Главная", icon: "home" }] },
  {
    title: "Продажи",
    items: [
      { href: "/orders", label: "Заявки", icon: "clipboard", module: "orders" },
      { href: "/shipments", label: "Отгрузки", icon: "truck", module: "shipments" },
      { href: "/payments", label: "Оплаты и долги", icon: "wallet", module: "payments" },
      { href: "/counterparties", label: "Контрагенты", icon: "users", module: "counterparties" },
      { href: "/prices", label: "Прайсы и КП", icon: "tag", module: "prices" },
    ],
  },
  {
    title: "Склад",
    items: [
      { href: "/products", label: "Товары", icon: "package", module: "products" },
      { href: "/receipts", label: "Приёмки", icon: "download", module: "receipts" },
      { href: "/stock", label: "Остатки", icon: "boxes", module: "stock" },
    ],
  },
  {
    title: "CRM",
    items: [
      { href: "/tasks", label: "Задачи", icon: "kanban", module: "tasks" },
      { href: "/pipeline", label: "Воронка", icon: "funnel", module: "pipeline" },
      { href: "/notes", label: "Заметки", icon: "note", module: "notes" },
      { href: "/team", label: "Команда", icon: "team", module: "team" },
      { href: "/whatsapp", label: "WhatsApp", icon: "chat", module: "whatsapp" },
      { href: "/assistant", label: "Ассистент", icon: "sparkles", module: "assistant" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { href: "/finance", label: "Финансы", icon: "landmark", module: "finance" },
      { href: "/payroll", label: "Зарплата", icon: "coins", flag: "payroll" },
      { href: "/analytics", label: "Аналитика", icon: "chart", module: "analytics" },
    ],
  },
  { title: "", items: [{ href: "/settings", label: "Настройки", icon: "settings", module: "settings" }] },
];

/** Нижняя навигация на телефоне — 4 главных раздела + «Ещё» */
export const MOBILE_PRIMARY = ["/", "/orders", "/tasks", "/products"];
