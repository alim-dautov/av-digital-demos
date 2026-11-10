import type { CompanyVertical } from "@/types";
import type { AccessSubject, Resource } from "@/lib/rbac";
import { can } from "@/lib/rbac";

export type NavIconName =
  | "Home"
  | "ClipboardList"
  | "Users"
  | "Calculator"
  | "Factory"
  | "Warehouse"
  | "UserCog"
  | "Wallet"
  | "CheckSquare"
  | "FileText"
  | "Landmark"
  | "ListChecks"
  | "Settings"
  | "BarChart3"
  | "Mic"
  | "QrCode"
  | "Percent"
  | "CalendarDays"
  | "Images"
  | "FileSignature"
  | "ShoppingCart"
  | "Scissors";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  resource: Resource;
  /** If set, only show for this vertical */
  vertical?: CompanyVertical | "both";
  /** Personal pages every signed-in user has (own password, notifications). */
  alwaysVisible?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Главная", icon: "Home", resource: "dashboard" },
  { href: "/orders", label: "Заказы", icon: "ClipboardList", resource: "orders" },
  { href: "/clients", label: "Клиенты", icon: "Users", resource: "clients" },
  {
    href: "/calculator",
    label: "Калькулятор",
    icon: "Calculator",
    resource: "calculator",
  },
  {
    href: "/proposals",
    label: "КП",
    icon: "FileSignature",
    resource: "proposals",
    vertical: "textiles",
  },
  {
    href: "/calendar",
    label: "Календарь",
    icon: "CalendarDays",
    resource: "calendar",
    vertical: "textiles",
  },
  {
    href: "/gallery",
    label: "Галерея",
    icon: "Images",
    resource: "gallery",
    vertical: "textiles",
  },
  {
    href: "/workshop",
    label: "Цех",
    icon: "Scissors",
    resource: "workshop",
    vertical: "textiles",
  },
  {
    href: "/production",
    label: "Производство",
    icon: "Factory",
    resource: "production",
    vertical: "furniture",
  },
  {
    href: "/inventory",
    label: "Склад",
    icon: "Warehouse",
    resource: "inventory",
  },
  {
    href: "/purchases",
    label: "Закуп",
    icon: "ShoppingCart",
    resource: "purchases",
    vertical: "textiles",
  },
  {
    href: "/costing",
    label: "Себестоимость",
    icon: "Percent",
    resource: "costing",
    vertical: "textiles",
  },
  {
    href: "/employees",
    label: "Сотрудники",
    icon: "UserCog",
    resource: "employees",
  },
  {
    href: "/attendance",
    label: "Посещаемость",
    icon: "QrCode",
    resource: "attendance",
    vertical: "furniture",
  },
  {
    href: "/payroll",
    label: "Зарплаты",
    icon: "Wallet",
    resource: "payroll",
    vertical: "furniture",
  },
  { href: "/tasks", label: "Задачи", icon: "CheckSquare", resource: "tasks" },
  {
    href: "/reports",
    label: "Отчёты",
    icon: "FileText",
    resource: "reports",
    vertical: "furniture",
  },
  {
    href: "/finance",
    label: "Финансы",
    icon: "Landmark",
    resource: "finance",
  },
  {
    href: "/checklists",
    label: "Чек-листы",
    icon: "ListChecks",
    resource: "checklists",
    vertical: "furniture",
  },
  {
    href: "/settings",
    label: "Настройки",
    icon: "Settings",
    resource: "settings",
    alwaysVisible: true,
  },
  {
    href: "/analytics",
    label: "Аналитика",
    icon: "BarChart3",
    resource: "analytics",
  },
];

export const ASSISTANT_NAV: NavItem = {
  href: "/assistant",
  label: "Голосовой ассистент",
  icon: "Mic",
  resource: "assistant",
};

export const MOBILE_PRIMARY_HREFS = ["/", "/orders", "/workshop", "/tasks", "/inventory"] as const;

export function getNavForUser(
  subject: AccessSubject,
  vertical: CompanyVertical,
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.alwaysVisible && !can(subject, item.resource)) return false;
    if (!item.vertical || item.vertical === "both") return true;
    return item.vertical === vertical;
  }).map((item) => {
    const role = typeof subject === "string" ? subject : subject.role;
    if (role === "SEAMSTRESS" && item.href === "/orders") {
      return { ...item, label: "Заказы на пошив" };
    }
    return item;
  });
}
