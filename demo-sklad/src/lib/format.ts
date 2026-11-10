/** Деньги, даты, числа. Деньги — целые тиыны. Часовой пояс — Asia/Almaty. */

export const TZ = "Asia/Almaty";

/** ₸ → тиын */
export const toTiyn = (tenge: number | string) => Math.round(Number(String(tenge).replace(/\s/g, "").replace(",", ".")) * 100) || 0;
/** тиын → ₸ (number) */
export const toTenge = (tiyn: number) => tiyn / 100;
/** Округление до целых тенге (в тиынах) */
export const roundTenge = (tiyn: number) => Math.round(tiyn / 100) * 100;

const nf0 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export function money(tiyn: number | null | undefined, opts: { sign?: boolean; cents?: boolean } = {}) {
  if (tiyn == null) return "—";
  const v = tiyn / 100;
  const s = (opts.cents || Math.abs(tiyn) % 100 !== 0 ? nf2 : nf0).format(Math.abs(v)).replace(/ /g, " ");
  const sign = tiyn < 0 ? "−" : opts.sign && tiyn > 0 ? "+" : "";
  return `${sign}${s} ₸`;
}
export const num = (n: number | null | undefined) => (n == null ? "—" : nf3.format(n).replace(/ /g, " "));
export const pct = (n: number, digits = 1) => `${n.toFixed(digits).replace(".", ",")}%`;
export const bp = (rateBp: number) => `${(rateBp / 100).toString().replace(".", ",")}%`;

/** Текущая дата (Казахстан, UTC+5), YYYY-MM-DD */
export function today(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
/** День недели 0=Вс..6=Сб для ISO-даты */
export const weekday = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();

export function fmtDate(v: string | Date | null | undefined, withTime = false) {
  if (!v) return "—";
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T00:00:00+05:00" : v) : v;
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
export function fmtRelative(v: string | Date) {
  const d = typeof v === "string" ? new Date(v) : v;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
  return fmtDate(d);
}
export const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export function monthRange(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}` };
}
export function weekRange(iso: string) {
  const wd = weekday(iso) || 7; // Пн=1
  const start = addDays(iso, 1 - wd);
  return { start, end: addDays(start, 6) };
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Нормализация строки для поиска */
export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}.,\s×x*-]/gu, " ").replace(/\s+/g, " ").trim();
