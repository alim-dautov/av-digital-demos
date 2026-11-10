import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { settings } from "@/db/schema";

export type CompanySettings = {
  name: string; legalName: string; bin: string; address: string; phone: string; email: string;
  bank: string; iban: string; bik: string; director: string; website: string;
  /** Печать на документах: auto — рисуется автоматически из реквизитов, image — загруженный скан, none — без печати */
  stamp: "auto" | "image" | "none"; stampFileId: number | null; signatureFileId: number | null;
};
export type AppSettings = {
  company: CompanySettings;
  debtPolicy: { mode: "warn" | "block" | "none" };
  payroll: {
    employeesSeeOwn: boolean; selfCheckin: boolean; periodKind: "month" | "half" | "week";
    /** Нарастающий штраф: первый штраф за месяц и прибавка за каждый следующий (тиыны; 0 — без подсказки суммы) */
    penaltyBase: number; penaltyStep: number;
  };
  leads: { staleDays: number };
  tasks: { dueSoonHours: number };
  /** Синонимы для поиска товаров: одна группа в строке, слова через «=» или запятую */
  search: { synonyms: string };
};

export const DEFAULT_SETTINGS: AppSettings = {
  company: {
    name: "Electro Demo", legalName: "ТОО «Electro Demo»", bin: "", address: "г. Алматы", phone: "", email: "", bank: "", iban: "", bik: "", director: "", website: "",
    stamp: "auto", stampFileId: null, signatureFileId: null,
  },
  debtPolicy: { mode: "warn" },
  payroll: { employeesSeeOwn: true, selfCheckin: false, periodKind: "month", penaltyBase: 0, penaltyStep: 0 },
  leads: { staleDays: 3 },
  tasks: { dueSoonHours: 24 },
  search: {
    synonyms: [
      "перфоратор = перф",
      "болгарка = ушм = угловая шлифмашина",
      "шуруповерт = шурик",
      "удлинитель = переноска",
      "автомат = автоматический выключатель",
    ].join("\n"),
  },
};

export async function getSetting<K extends keyof AppSettings>(db: DB, key: K): Promise<AppSettings[K]> {
  const [r] = await db.select().from(settings).where(eq(settings.key, key));
  const def = DEFAULT_SETTINGS[key];
  if (!r) return def;
  return (typeof def === "object" ? { ...def, ...(r.value as object) } : r.value) as AppSettings[K];
}
export async function setSetting<K extends keyof AppSettings>(db: DB, key: K, value: AppSettings[K]) {
  await db.insert(settings).values({ key, value: value as never }).onConflictDoUpdate({ target: settings.key, set: { value: value as never, updatedAt: new Date() } });
}
