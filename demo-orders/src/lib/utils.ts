import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatKzt(amount: number | string | null | undefined): string {
  const n = Number(amount ?? 0);
  return `${new Intl.NumberFormat("ru-KZ", {
    maximumFractionDigits: 0,
  }).format(Math.round(n))} ₸`;
}

export function formatNumberRu(n: number | null | undefined, digits = 2): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(
    Number(n ?? 0),
  );
}

export function formatMeters(n: number | null | undefined, unit = "м"): string {
  return `${formatNumberRu(n)} ${unit}`;
}

export function formatSizeM(...dims: (number | null | undefined)[]): string {
  return `${dims.map((d) => formatNumberRu(d)).join(" × ")} м`;
}

export function normalizePhoneDigits(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

const PLURAL_RULES = new Intl.PluralRules("ru-RU");

/** forms: [one, few, many], e.g. ["заказ", "заказа", "заказов"] */
export function pluralRu(count: number, forms: [string, string, string]): string {
  const rule = PLURAL_RULES.select(count);
  const word = rule === "one" ? forms[0] : rule === "few" ? forms[1] : forms[2];
  return `${count} ${word}`;
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)}%`;
}

export function generateId(prefix = ""): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id.slice(0, 8)}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatDateRu(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatTimeRu(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function minutesBetween(checkInIso: string, workStart: string): number {
  const d = new Date(checkInIso);
  const checkMins = d.getHours() * 60 + d.getMinutes();
  const startMins = parseTimeToMinutes(workStart);
  return Math.max(0, checkMins - startMins);
}

export const TZ = "Asia/Almaty";
export const MEBELDEMO_ID = "company_001";
export const ATELIER_ID = "company_002";
