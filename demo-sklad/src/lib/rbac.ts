/** Модули, уровни доступа и флаги. Используется и на сервере, и в UI. */

export const MODULES = {
  products: "Товары",
  counterparties: "Контрагенты",
  orders: "Заявки",
  shipments: "Отгрузки и возвраты",
  receipts: "Приёмки",
  payments: "Оплаты",
  stock: "Остатки",
  prices: "Прайсы и КП",
  analytics: "Аналитика",
  tasks: "Задачи",
  pipeline: "Воронка продаж",
  team: "Команда",
  notes: "Заметки",
  finance: "Финансы",
  whatsapp: "WhatsApp",
  assistant: "Ассистент",
  settings: "Настройки",
} as const;
export type ModuleKey = keyof typeof MODULES;
export const MODULE_KEYS = Object.keys(MODULES) as ModuleKey[];

export type Level = "none" | "view" | "full";
export const LEVELS: Record<Level, string> = { none: "Нет доступа", view: "Просмотр", full: "Полный" };

export const FLAGS = {
  seePurchase: "Видеть закупочные цены",
  seeProfit: "Видеть прибыль и маржу",
  seeSalaries: "Видеть все зарплаты",
  deleteDocs: "Удалять документы",
  payrollEditSchemes: "Редактировать схемы оплаты",
  payrollClosePeriod: "Закрывать зарплатный период",
  payrollPay: "Проводить выплаты и авансы",
  payrollTimesheet: "Вести табель",
  seeOwnEarnings: "Видеть свой заработок",
} as const;
export type FlagKey = keyof typeof FLAGS;
export const FLAG_KEYS = Object.keys(FLAGS) as FlagKey[];

export type Permissions = { modules: Partial<Record<ModuleKey, Level>>; flags: Partial<Record<FlagKey, boolean>> };

export type Principal = {
  id: number;
  name: string;
  isOwner: boolean;
  isSalesManager: boolean;
  isAssembler: boolean;
  permissions: Permissions;
  /** API-токен (если вызов через API/MCP) */
  tokenId?: number;
};

const rank: Record<Level, number> = { none: 0, view: 1, full: 2 };

export function level(p: Pick<Principal, "isOwner" | "permissions">, m: ModuleKey): Level {
  if (p.isOwner && !("tokenId" in p && (p as Principal).tokenId)) return "full";
  return p.permissions.modules[m] ?? "none";
}
export function can(p: Pick<Principal, "isOwner" | "permissions">, m: ModuleKey, need: Level = "view"): boolean {
  return rank[level(p, m)] >= rank[need];
}
export function flag(p: Pick<Principal, "isOwner" | "permissions">, f: FlagKey): boolean {
  if (p.isOwner && !("tokenId" in p && (p as Principal).tokenId)) return true;
  return !!p.permissions.flags[f];
}

/** Пересечение прав токена и прав пользователя-владельца токена */
export function intersect(a: Permissions, b: Permissions): Permissions {
  const modules: Permissions["modules"] = {};
  for (const m of MODULE_KEYS) {
    const la = a.modules[m] ?? "none", lb = b.modules[m] ?? "none";
    modules[m] = rank[la] <= rank[lb] ? la : lb;
  }
  const flags: Permissions["flags"] = {};
  for (const f of FLAG_KEYS) flags[f] = !!a.flags[f] && !!b.flags[f];
  return { modules, flags };
}

export function fullPermissions(): Permissions {
  return {
    modules: Object.fromEntries(MODULE_KEYS.map((m) => [m, "full"])) as Permissions["modules"],
    flags: Object.fromEntries(FLAG_KEYS.map((f) => [f, true])) as Permissions["flags"],
  };
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg = "Недостаточно прав") { super(msg); }
}
export class NotFoundError extends Error {
  status = 404;
  constructor(msg = "Не найдено") { super(msg); }
}
export class ValidationError extends Error {
  status = 400;
  constructor(msg: string) { super(msg); }
}

export function assertCan(p: Principal, m: ModuleKey, need: Level = "view") {
  if (!can(p, m, need)) throw new ForbiddenError(`Нет доступа к модулю «${MODULES[m]}»${need === "full" ? " (нужен полный доступ)" : ""}`);
}
export function assertFlag(p: Principal, f: FlagKey) {
  if (!flag(p, f)) throw new ForbiddenError(`Нет права: ${FLAGS[f]}`);
}

/** Доступ к разделу «Зарплата»: свой заработок или любые права по зарплате */
export function canPayroll(p: Pick<Principal, "isOwner" | "permissions">) {
  return (["seeOwnEarnings", "seeSalaries", "payrollEditSchemes", "payrollTimesheet", "payrollPay", "payrollClosePeriod"] as FlagKey[]).some((f) => flag(p, f));
}

/** Субъект для публичных подписанных ссылок: только просмотр нужных модулей, без флагов (закупка/маржа скрыты) */
export function linkViewer(modules: Partial<Record<ModuleKey, Level>>): Principal {
  return { id: 0, name: "Публичная ссылка", isOwner: false, isSalesManager: false, isAssembler: false, permissions: { modules, flags: {} } as Permissions };
}
