import type { AccessLevel, AccessOverrides, UserPermissions, UserRole } from "@/types";

export type Resource =
  | "dashboard"
  | "orders"
  | "clients"
  | "calculator"
  | "production"
  | "workshop"
  | "inventory"
  | "employees"
  | "payroll"
  | "tasks"
  | "reports"
  | "finance"
  | "costing"
  | "checklists"
  | "analytics"
  | "attendance"
  | "settings"
  | "assistant"
  | "notifications"
  | "calendar"
  | "gallery"
  | "proposals"
  | "purchases";

export type Action = "read" | "write" | "manage";

/** A role, or a user with optional per-module overrides on top of the role. */
export type AccessSubject =
  | UserRole
  | { role: UserRole; access?: AccessOverrides | null; disabledModules?: string[] };

export const ALL_RESOURCES: Resource[] = [
  "dashboard",
  "orders",
  "clients",
  "calculator",
  "production",
  "workshop",
  "inventory",
  "employees",
  "payroll",
  "tasks",
  "reports",
  "finance",
  "costing",
  "checklists",
  "analytics",
  "attendance",
  "settings",
  "assistant",
  "notifications",
  "calendar",
  "gallery",
  "proposals",
  "purchases",
];

export const RESOURCE_LABELS: Record<Resource, string> = {
  dashboard: "Главная",
  orders: "Заказы",
  clients: "Клиенты",
  calculator: "Калькулятор",
  production: "Производство",
  workshop: "Швейный цех",
  inventory: "Склад",
  employees: "Сотрудники",
  payroll: "Зарплаты",
  tasks: "Задачи",
  reports: "Отчёты",
  finance: "Финансы",
  costing: "Себестоимость",
  checklists: "Чек-листы",
  analytics: "Аналитика",
  attendance: "Посещаемость",
  settings: "Настройки",
  assistant: "Ассистент",
  notifications: "Уведомления",
  calendar: "Календарь",
  gallery: "Галерея",
  proposals: "КП",
  purchases: "Закуп",
};

export type Department = {
  id: string;
  label: string;
  resources: Resource[];
};

/** Modules grouped by department for the access settings screen. */
export const DEPARTMENTS: Department[] = [
  {
    id: "sales",
    label: "Продажи",
    resources: ["dashboard", "orders", "clients", "calculator", "proposals", "calendar"],
  },
  {
    id: "workshop",
    label: "Швейный цех",
    resources: ["workshop", "production", "inventory", "checklists"],
  },
  {
    id: "finance",
    label: "Финансы",
    resources: ["finance", "costing", "purchases", "payroll", "analytics"],
  },
  { id: "media", label: "Медиа", resources: ["gallery"] },
  {
    id: "admin",
    label: "Администрирование",
    resources: [
      "employees",
      "tasks",
      "reports",
      "attendance",
      "notifications",
      "assistant",
      "settings",
    ],
  },
];

/** Roles whose module access cannot be narrowed: they own the system. */
const UNRESTRICTED_ROLES: UserRole[] = ["OWNER"];

const FULL: Action[] = ["read", "write", "manage"];

const matrix: Record<UserRole, Partial<Record<Resource, Action[]>>> = {
  OWNER: Object.fromEntries(ALL_RESOURCES.map((r) => [r, FULL])),
  ADMIN: Object.fromEntries(ALL_RESOURCES.map((r) => [r, FULL])),
  // Директор и операционный директор: доступ ко всему, включая финансы, кассу,
  // зарплаты/авансы и создание/деактивацию сотрудников.
  DIRECTOR: Object.fromEntries(ALL_RESOURCES.map((r) => [r, FULL])),
  // Управляющий: склад, проекты, калькулятор, QR-учёт. Финансы компании,
  // себестоимость, аналитика, закупки и чужие зарплаты закрыты; своя зарплата — да.
  MANAGER: {
    dashboard: ["read"],
    orders: ["read", "write"],
    clients: ["read", "write"],
    calculator: ["read", "write"],
    production: ["read", "write"],
    workshop: ["read"],
    inventory: ["read", "write"],
    employees: ["read"],
    payroll: ["read"],
    tasks: ["read", "write"],
    reports: ["read"],
    checklists: ["read", "write"],
    attendance: ["read", "write"],
    assistant: ["read", "write"],
    notifications: ["read", "write"],
    calendar: ["read", "write"],
    gallery: ["read", "write"],
    proposals: ["read", "write"],
  },
  // Сборщики и рабочие цеха (Mebel Demo): только активные проекты (чтение),
  // своя зарплата/авансы, своё посещение/опоздания, личные настройки.
  MASTER: {
    orders: ["read"],
    payroll: ["read"],
    attendance: ["read", "write"],
    notifications: ["read", "write"],
  },
  DRIVER: {
    dashboard: ["read"],
    orders: ["read"],
    tasks: ["read", "write"],
    attendance: ["read", "write"],
    notifications: ["read", "write"],
  },
  DESIGNER: {
    dashboard: ["read"],
    orders: ["read", "write"],
    clients: ["read", "write"],
    calculator: ["read", "write"],
    production: ["read"],
    tasks: ["read", "write"],
    assistant: ["read"],
    notifications: ["read", "write"],
    calendar: ["read", "write"],
    gallery: ["read", "write"],
    proposals: ["read", "write"],
  },
  TECHNOLOGIST: {
    dashboard: ["read"],
    orders: ["read", "write"],
    clients: ["read"],
    calculator: ["read", "write"],
    production: ["read", "write"],
    inventory: ["read"],
    tasks: ["read", "write"],
    checklists: ["read", "write"],
    assistant: ["read"],
    notifications: ["read", "write"],
  },
  WORKSHOP: {
    dashboard: ["read"],
    orders: ["read"],
    inventory: ["read", "write"],
    production: ["read"],
    workshop: ["read", "write"],
    notifications: ["read", "write"],
    gallery: ["read"],
  },
  SEAMSTRESS: {
    dashboard: ["read"],
    workshop: ["read", "write"],
    orders: ["read"],
    inventory: ["read", "write"],
    tasks: ["read", "write"],
    notifications: ["read", "write"],
  },
  MOBILOGRAPHER: {
    dashboard: ["read"],
    gallery: ["read", "write"],
    calendar: ["read"],
    notifications: ["read", "write"],
  },
};

function roleOf(subject: AccessSubject): UserRole {
  return typeof subject === "string" ? subject : subject.role;
}

function overrideOf(subject: AccessSubject, resource: Resource): AccessLevel | undefined {
  if (typeof subject === "string") return undefined;
  if (UNRESTRICTED_ROLES.includes(subject.role)) return undefined;
  return subject.access?.[resource];
}

function roleAllows(role: UserRole, resource: Resource, action: Action): boolean {
  const allowed = matrix[role]?.[resource] ?? [];
  if (action === "read") return allowed.length > 0;
  if (action === "write") return allowed.includes("write") || allowed.includes("manage");
  return allowed.includes("manage");
}

export function can(subject: AccessSubject, resource: Resource, action: Action = "read") {
  if (resource !== "settings" && typeof subject !== "string" && subject.disabledModules?.includes(resource)) return false;
  const role = roleOf(subject);
  const override = overrideOf(subject, resource);
  if (override === undefined) return roleAllows(role, resource, action);
  if (override === "none") return false;
  if (action === "read") return true;
  if (action === "write") return override === "write";
  return override === "write" && roleAllows(role, resource, "manage");
}

/** Level shown in the access editor: role default with the override applied. */
export function effectiveLevel(subject: AccessSubject, resource: Resource): AccessLevel {
  if (can(subject, resource, "write")) return "write";
  if (can(subject, resource, "read")) return "read";
  return "none";
}

export function roleDefaultLevel(role: UserRole, resource: Resource): AccessLevel {
  return effectiveLevel(role, resource);
}

export function isAccessRestrictable(role: UserRole): boolean {
  return !UNRESTRICTED_ROLES.includes(role);
}

export function visibleResources(subject: AccessSubject): Resource[] {
  return ALL_RESOURCES.filter((r) => can(subject, r, "read"));
}

export function canSeeFinance(subject: AccessSubject) {
  return can(subject, "finance", "read") || canSeeOthersPayroll(subject);
}

export function canSeeCosting(subject: AccessSubject) {
  return can(subject, "costing", "read");
}

export function canSeeOthersPayroll(subject: AccessSubject) {
  const role = roleOf(subject);
  if (!can(subject, "payroll", "read")) return false;
  return (
    role === "OWNER" ||
    role === "DIRECTOR" ||
    role === "ADMIN"
  );
}

/** Roles that show the workshop QR for check-in; MANAGER runs it without seeing pay. */
const QR_HOST_ROLES: UserRole[] = ["OWNER", "ADMIN", "DIRECTOR", "MANAGER"];

export function canHostAttendanceQr(subject: AccessSubject) {
  return QR_HOST_ROLES.includes(roleOf(subject)) && can(subject, "attendance", "write");
}


/** Owners always; everyone else, admins included, only with the explicit grant. */
export function canDeleteOrders(
  subject: { role: UserRole; access?: AccessOverrides | null; permissions?: UserPermissions | null; disabledModules?: string[] },
) {
  if (!can(subject, "orders", "read")) return false;
  if (subject.role === "OWNER") return true;
  if (!ORDER_DELETE_ROLES.has(subject.role)) return false;
  return subject.permissions?.deleteOrders !== false && can(subject, "orders", "read");
}

/** Who may edit order fields (client, money, dates, comments). Workers only change statuses. */
const ORDER_EDIT_ROLES = new Set<UserRole>(["OWNER", "DIRECTOR", "ADMIN", "MANAGER"]);
/** Director and admin delete orders unless the owner turned it off; the manager never does. */
const ORDER_DELETE_ROLES = new Set<UserRole>(["DIRECTOR", "ADMIN"]);

export function canEditOrders(subject: { role: UserRole; access?: AccessOverrides | null }) {
  return ORDER_EDIT_ROLES.has(subject.role) && can(subject, "orders", "write");
}

export function canManageAccess(subject: AccessSubject) {
  const role = roleOf(subject);
  return (
    (role === "OWNER" || role === "ADMIN" || role === "DIRECTOR") &&
    can(subject, "settings", "manage")
  );
}
