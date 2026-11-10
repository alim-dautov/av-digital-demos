import { and, asc, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import * as schema from "@/db/schema";
import { auditLog, orderStatuses, orders, priceTypes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ForbiddenError, ValidationError, assertCan, type Principal } from "@/lib/rbac";
import { getSetting, setSetting, type AppSettings } from "./store";

const assertOwner = (p: Principal) => { if (!p.isOwner || p.tokenId) throw new ForbiddenError("Только владелец"); };

export const companyInput = z.object({
  name: z.string().trim().min(1).max(120), legalName: z.string().max(200).default(""), bin: z.string().regex(/^(\d{12})?$/, "БИН — 12 цифр").default(""),
  address: z.string().max(300).default(""), phone: z.string().max(60).default(""), email: z.string().max(120).default(""),
  bank: z.string().max(200).default(""), iban: z.string().max(40).default(""), bik: z.string().max(20).default(""),
  director: z.string().max(120).default(""), website: z.string().max(200).default(""),
  stamp: z.enum(["auto", "image", "none"]).default("auto"),
  stampFileId: z.number().int().positive().nullable().default(null), signatureFileId: z.number().int().positive().nullable().default(null),
});

export const paramsInput = z.object({
  debtPolicy: z.object({ mode: z.enum(["warn", "block", "none"]) }),
  payroll: z.object({ employeesSeeOwn: z.boolean(), selfCheckin: z.boolean(), periodKind: z.enum(["month", "half", "week"]), penaltyBase: z.number().int().min(0).default(0), penaltyStep: z.number().int().min(0).default(0) }),
  leads: z.object({ staleDays: z.number().int().min(1).max(60) }),
  tasks: z.object({ dueSoonHours: z.number().int().min(1).max(240) }),
});

export async function getAllSettings(db: DB): Promise<AppSettings> {
  const [company, debtPolicy, payroll, leads, tasks, search] = await Promise.all([getSetting(db, "company"), getSetting(db, "debtPolicy"), getSetting(db, "payroll"), getSetting(db, "leads"), getSetting(db, "tasks"), getSetting(db, "search")]);
  return { company, debtPolicy, payroll, leads, tasks, search };
}

export const synonymsInput = z.object({ synonyms: z.string().max(20000) });
/** Словарь синонимов поиска — только владелец */
export async function saveSynonyms(db: DB, p: Principal, i: z.infer<typeof synonymsInput>) {
  assertOwner(p);
  await setSetting(db, "search", { synonyms: i.synonyms.split(String.fromCharCode(13)).join("").trim() });
  await audit(db, p, "update", "settings", "search", "Изменён словарь синонимов поиска");
}

export async function saveCompany(db: DB, p: Principal, i: z.infer<typeof companyInput>) {
  assertCan(p, "settings", "full");
  await setSetting(db, "company", i);
  await audit(db, p, "update", "settings", "company", "Изменены реквизиты компании");
}

export async function saveParams(db: DB, p: Principal, i: z.infer<typeof paramsInput>) {
  assertCan(p, "settings", "full");
  for (const k of ["debtPolicy", "payroll", "leads", "tasks"] as const) await setSetting(db, k, i[k] as never);
  await audit(db, p, "update", "settings", "params", "Изменены параметры работы", i);
}

/* ───── Справочники ───── */

export const priceTypeInput = z.object({ id: z.number().int().optional(), name: z.string().trim().min(1).max(60), sort: z.number().int().default(0), active: z.boolean().default(true) });
export async function savePriceType(db: DB, p: Principal, i: z.infer<typeof priceTypeInput>) {
  assertCan(p, "settings", "full");
  if (i.id) {
    const [t] = await db.select().from(priceTypes).where(eq(priceTypes.id, i.id));
    if (t?.isPurchase && !i.active) throw new ValidationError("Закупочную цену нельзя отключить");
    await db.update(priceTypes).set({ name: i.name, sort: i.sort, active: i.active }).where(eq(priceTypes.id, i.id));
  } else {
    await db.insert(priceTypes).values({ name: i.name, sort: i.sort, active: i.active, code: `custom_${Date.now().toString(36)}` });
  }
  await audit(db, p, i.id ? "update" : "create", "price_type", i.id ?? null, `Тип цены «${i.name}»`);
}

export const statusInput = z.object({ id: z.number().int().optional(), name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-f]{6}$/i), sort: z.number().int().default(0), isFinal: z.boolean().default(false), isCancelled: z.boolean().default(false) });
export async function saveStatus(db: DB, p: Principal, i: z.infer<typeof statusInput>) {
  assertCan(p, "settings", "full");
  const v = { name: i.name, color: i.color, sort: i.sort, isFinal: i.isFinal || i.isCancelled, isCancelled: i.isCancelled };
  if (i.id) {
    const [s] = await db.select().from(orderStatuses).where(eq(orderStatuses.id, i.id));
    // у системных статусов меняются только название, цвет и порядок — от флагов зависит логика заявок
    await db.update(orderStatuses).set(s && !s.code.startsWith("custom_") ? { name: v.name, color: v.color, sort: v.sort } : v).where(eq(orderStatuses.id, i.id));
  } else await db.insert(orderStatuses).values({ ...v, code: `custom_${Date.now().toString(36)}` });
  await audit(db, p, i.id ? "update" : "create", "order_status", i.id ?? null, `Статус заявки «${i.name}»`);
}
export async function deleteStatus(db: DB, p: Principal, id: number) {
  assertCan(p, "settings", "full");
  const [s] = await db.select().from(orderStatuses).where(eq(orderStatuses.id, id));
  if (!s) return;
  if (!s.code.startsWith("custom_")) throw new ValidationError("Системный статус можно только переименовать");
  const [u] = await db.select({ c: sql<number>`count(*)::int` }).from(orders).where(eq(orders.statusId, id));
  if (u.c) throw new ValidationError(`Статус используется в ${u.c} заявках`);
  await db.delete(orderStatuses).where(eq(orderStatuses.id, id));
  await audit(db, p, "delete", "order_status", id, `Удалён статус «${s.name}»`);
}
export const listStatuses = (db: DB) => db.select().from(orderStatuses).orderBy(asc(orderStatuses.sort), asc(orderStatuses.id));
export const listPriceTypes = (db: DB) => db.select().from(priceTypes).orderBy(asc(priceTypes.sort), asc(priceTypes.id));

/* ───── Журнал действий ───── */

export async function auditList(db: DB, p: Principal, f: { userId?: number; entity?: string; q?: string; from?: string; to?: string; page?: number }) {
  assertOwner(p);
  const where = and(
    f.userId ? eq(auditLog.userId, f.userId) : undefined,
    f.entity ? eq(auditLog.entity, f.entity) : undefined,
    f.q ? ilike(auditLog.summary, `%${f.q}%`) : undefined,
    f.from ? gte(auditLog.createdAt, new Date(`${f.from}T00:00:00+05:00`)) : undefined,
    f.to ? lte(auditLog.createdAt, new Date(`${f.to}T23:59:59+05:00`)) : undefined,
  );
  const size = 50, page = Math.max(1, f.page ?? 1);
  const [rows, [t]] = await Promise.all([
    db.select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, summary: auditLog.summary, createdAt: auditLog.createdAt, tokenId: auditLog.tokenId, userName: users.name })
      .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(where).orderBy(desc(auditLog.id)).limit(size).offset((page - 1) * size),
    db.select({ c: sql<number>`count(*)::int` }).from(auditLog).where(where),
  ]);
  return { rows, total: t.c, page, size };
}
export async function auditEntities(db: DB) {
  return (await db.selectDistinct({ e: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity))).map((r) => r.e);
}

/* ───── Резервная копия ───── */

/** Секреты не выгружаются: хэши паролей, сессии, хэши токенов, секреты вебхуков, push-подписки */
const SKIP = new Set(["sessions", "pushSubscriptions"]);
const REDACT: Record<string, string[]> = { users: ["passwordHash"], apiTokens: ["tokenHash"], webhooks: ["secret"] };
const isTable = (t: unknown) => typeof t === "object" && t !== null && Symbol.for("drizzle:IsDrizzleTable") in t;

export async function backupDump(db: DB, p: Principal) {
  assertOwner(p);
  const out: Record<string, unknown[]> = {};
  for (const [name, table] of Object.entries(schema)) {
    if (SKIP.has(name) || !isTable(table)) continue;
    const rows = (await db.select().from(table as never)) as Record<string, unknown>[];
    out[name] = REDACT[name] ? rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !REDACT[name].includes(k)))) : rows;
  }
  await audit(db, p, "export", "backup", null, "Выгружена резервная копия");
  return { app: "demo-crm", version: 1, createdAt: new Date().toISOString(), tables: out };
}
