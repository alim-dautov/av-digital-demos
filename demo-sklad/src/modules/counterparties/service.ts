import { and, asc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { counterparties, counterpartyTags, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { daysBetween, norm, today } from "@/lib/format";
import { getSetting } from "@/modules/settings/store";

export const counterpartyInput = z.object({
  kind: z.enum(["client", "supplier", "both"]).default("client"),
  name: z.string().trim().min(1, "Укажите название").max(300),
  segment: z.enum(["bazaar", "shop", "install", "other"]).default("other"),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
  phone: z.string().trim().max(40).nullable().optional(),
  whatsapp: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  bin: z.string().trim().max(20).nullable().optional(),
  comment: z.string().max(5000).default(""),
  contacts: z.array(z.object({ name: z.string(), phone: z.string().optional(), role: z.string().optional() })).default([]),
  documents: z.array(z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() })).default([]),
  managerId: z.number().int().nullable().optional(),
  debtLimit: z.number().int().min(0).default(0),
  debtLimitMode: z.enum(["default", "warn", "block", "none"]).default("default"),
});
export type CounterpartyInput = z.infer<typeof counterpartyInput>;

/** Балансы: долг клиента нам (client_debt) и наш долг поставщику (our_debt), тиын */
export function balancesSql(until?: string): SQL {
  const d = until ?? "9999-12-31";
  return sql`(select c.id as cp_id,
    coalesce((select sum(case when s.kind = 'shipment' then s.total else -s.total end) from shipments s
      where s.counterparty_id = c.id and s.posted and s.deleted_at is null and s.date <= ${d}), 0)
    - coalesce((select sum(p.amount) from payments p where p.counterparty_id = c.id and p.direction = 'in' and p.deleted_at is null and p.date <= ${d}), 0)
    as client_debt,
    coalesce((select sum(r.total) from receipts r where r.supplier_id = c.id and r.posted and r.deleted_at is null and r.date <= ${d}), 0)
    - coalesce((select sum(p.amount) from payments p where p.counterparty_id = c.id and p.direction = 'out' and p.deleted_at is null and p.date <= ${d}), 0)
    as our_debt
    from counterparties c)`;
}

export async function balanceOf(db: DB, id: number) {
  const [r] = await q<{ client_debt: number; our_debt: number }>(db, sql`select client_debt::float8, our_debt::float8 from ${balancesSql()} b where b.cp_id = ${id}`);
  return { clientDebt: Number(r?.client_debt ?? 0), ourDebt: Number(r?.our_debt ?? 0) };
}

export type CpListParams = { q?: string; kind?: "client" | "supplier"; tag?: string; segment?: string; managerId?: number; debtors?: boolean; page?: number; pageSize?: number };

export async function listCounterparties(db: DB, p: Principal, params: CpListParams = {}) {
  assertCan(p, "counterparties");
  const page = Math.max(1, params.page ?? 1), size = Math.min(500, params.pageSize ?? 50);
  const conds: (SQL | undefined)[] = [isNull(counterparties.deletedAt)];
  if (params.kind === "client") conds.push(ne(counterparties.kind, "supplier"));
  if (params.kind === "supplier") conds.push(ne(counterparties.kind, "client"));
  if (params.q) {
    const t = `%${norm(params.q)}%`;
    conds.push(or(sql`lower(${counterparties.name}) like ${t}`, sql`coalesce(${counterparties.phone},'') like ${"%" + params.q.replace(/\D/g, "") + "%"}`));
  }
  if (params.tag) conds.push(sql`${counterparties.tags} @> ${JSON.stringify([params.tag])}::jsonb`);
  if (params.segment) conds.push(eq(counterparties.segment, params.segment));
  if (params.managerId) conds.push(eq(counterparties.managerId, params.managerId));
  const b = balancesSql();
  if (params.debtors) conds.push(params.kind === "supplier" ? sql`b.our_debt > 0` : sql`b.client_debt > 0`);
  const where = and(...conds);
  const rows = await db.select({
    id: counterparties.id, kind: counterparties.kind, name: counterparties.name, isService: counterparties.isService, segment: counterparties.segment,
    tags: counterparties.tags, phone: counterparties.phone, whatsapp: counterparties.whatsapp, address: counterparties.address,
    managerId: counterparties.managerId, managerName: users.name, debtLimit: counterparties.debtLimit,
    clientDebt: sql<number>`b.client_debt::float8`, ourDebt: sql<number>`b.our_debt::float8`,
  }).from(counterparties)
    .leftJoin(sql`${b} b`, sql`b.cp_id = ${counterparties.id}`)
    .leftJoin(users, eq(users.id, counterparties.managerId))
    .where(where).orderBy(asc(counterparties.isService), asc(counterparties.name)).limit(size).offset((page - 1) * size);
  const [{ c }] = await db.select({ c: sql<number>`count(*)::int` }).from(counterparties).leftJoin(sql`${b} b`, sql`b.cp_id = ${counterparties.id}`).where(where);
  return { rows: rows.map((r) => ({ ...r, clientDebt: Number(r.clientDebt), ourDebt: Number(r.ourDebt) })), total: c, page, pageSize: size };
}

export async function getCounterparty(db: DB, p: Principal, id: number) {
  assertCan(p, "counterparties");
  const [c] = await db.select().from(counterparties).where(and(eq(counterparties.id, id), isNull(counterparties.deletedAt)));
  if (!c) throw new NotFoundError("Контрагент не найден");
  const bal = await balanceOf(db, id);
  const overdue = await overdueDays(db, id, bal.clientDebt);
  return { ...c, ...bal, overdueDays: overdue };
}

/** Просрочка: возраст самой старой неоплаченной отгрузки (FIFO) */
export async function overdueDays(db: DB, cpId: number, debt: number) {
  if (debt <= 0) return 0;
  const rows = await q<{ date: string; total: number }>(db, sql`select date::text, total::float8 from shipments
    where counterparty_id = ${cpId} and kind = 'shipment' and posted and deleted_at is null order by date desc, id desc`);
  let rest = debt, oldest: string | null = null;
  for (const r of rows) { if (rest <= 0) break; rest -= Number(r.total); oldest = r.date; }
  return oldest ? Math.max(0, daysBetween(oldest, today())) : 0;
}

export async function createCounterparty(db: DB, p: Principal, input: CounterpartyInput) {
  assertCan(p, "counterparties", "full");
  const [c] = await db.insert(counterparties).values({ ...input, managerId: input.managerId ?? null }).returning();
  await ensureTags(db, input.tags);
  await audit(db, p, "create", "counterparty", c.id, `Создан контрагент «${c.name}»`);
  return c;
}
export async function updateCounterparty(db: DB, p: Principal, id: number, input: CounterpartyInput) {
  assertCan(p, "counterparties", "full");
  const [before] = await db.select().from(counterparties).where(eq(counterparties.id, id));
  if (!before) throw new NotFoundError();
  const [c] = await db.update(counterparties).set({ ...input, managerId: input.managerId ?? null, updatedAt: new Date() }).where(eq(counterparties.id, id)).returning();
  await ensureTags(db, input.tags);
  await audit(db, p, "update", "counterparty", id, `Изменён контрагент «${c.name}»`,
    before.debtLimit !== c.debtLimit ? { debtLimit: [before.debtLimit, c.debtLimit] } : undefined);
  return c;
}
export async function deleteCounterparty(db: DB, p: Principal, id: number) {
  assertCan(p, "counterparties", "full");
  const [c] = await db.select().from(counterparties).where(eq(counterparties.id, id));
  if (!c) throw new NotFoundError();
  if (c.isService) throw new ValidationError("Служебный контрагент не удаляется");
  await db.update(counterparties).set({ deletedAt: new Date() }).where(eq(counterparties.id, id));
  await audit(db, p, "delete", "counterparty", id, `Удалён контрагент «${c.name}»`);
}

async function ensureTags(db: DB, tags: string[]) {
  if (!tags.length) return;
  await db.insert(counterpartyTags).values(tags.map((name) => ({ name }))).onConflictDoNothing();
}
export async function listTags(db: DB) { return db.select().from(counterpartyTags).orderBy(asc(counterpartyTags.name)); }

/** Проверка лимита долга перед отгрузкой */
export async function checkDebtLimit(db: DB, cpId: number, addAmount: number) {
  const [c] = await db.select().from(counterparties).where(eq(counterparties.id, cpId));
  if (!c || c.debtLimit <= 0) return { exceeded: false as const };
  const policy = await getSetting(db, "debtPolicy");
  const mode = c.debtLimitMode === "default" ? policy.mode : c.debtLimitMode;
  if (mode === "none") return { exceeded: false as const };
  const { clientDebt } = await balanceOf(db, cpId);
  const after = clientDebt + addAmount;
  if (after <= c.debtLimit) return { exceeded: false as const };
  return { exceeded: true as const, mode, debt: clientDebt, after, limit: c.debtLimit, name: c.name, managerId: c.managerId };
}

/* ───── Акт сверки ───── */

export type ReconRow = { date: string; doc: string; link: string; debit: number; credit: number };
/**
 * Акт сверки. Для клиента: дебет — отгрузки (долг клиента растёт), кредит — оплаты и возвраты.
 * Для поставщика: кредит — приёмки (наш долг растёт), дебет — наши оплаты.
 */
export async function reconciliation(db: DB, p: Principal, cpId: number, from: string, to: string, side: "client" | "supplier") {
  assertCan(p, "counterparties");
  const [cp] = await db.select().from(counterparties).where(eq(counterparties.id, cpId));
  if (!cp) throw new NotFoundError();
  const dayBefore = new Date(Date.parse(from + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);
  const [ob] = await q<{ client_debt: number; our_debt: number }>(db, sql`select client_debt::float8, our_debt::float8 from ${balancesSql(dayBefore)} b where b.cp_id = ${cpId}`);
  const rows: ReconRow[] = [];
  if (side === "client") {
    const sh = await q<{ id: number; number: number; kind: string; date: string; total: number }>(db, sql`select id, number, kind, date::text, total::float8 from shipments
      where counterparty_id = ${cpId} and posted and deleted_at is null and date between ${from} and ${to} order by date, id`);
    for (const s of sh) rows.push({ date: s.date, doc: `${s.kind === "return" ? "Возврат" : "Отгрузка"} №${s.number}`, link: `/shipments/${s.id}`, debit: s.kind === "shipment" ? Number(s.total) : 0, credit: s.kind === "return" ? Number(s.total) : 0 });
    const pay = await q<{ id: number; number: number; date: string; amount: number; method: string }>(db, sql`select id, number, date::text, amount::float8, method from payments
      where counterparty_id = ${cpId} and direction = 'in' and deleted_at is null and date between ${from} and ${to}`);
    for (const x of pay) rows.push({ date: x.date, doc: `Оплата №${x.number}`, link: `/payments/${x.id}`, debit: 0, credit: Number(x.amount) });
  } else {
    const rc = await q<{ id: number; number: number; date: string; total: number }>(db, sql`select id, number, date::text, total::float8 from receipts
      where supplier_id = ${cpId} and posted and deleted_at is null and date between ${from} and ${to}`);
    for (const r of rc) rows.push({ date: r.date, doc: `Приёмка №${r.number}`, link: `/receipts/${r.id}`, debit: 0, credit: Number(r.total) });
    const pay = await q<{ id: number; number: number; date: string; amount: number }>(db, sql`select id, number, date::text, amount::float8 from payments
      where counterparty_id = ${cpId} and direction = 'out' and deleted_at is null and date between ${from} and ${to}`);
    for (const x of pay) rows.push({ date: x.date, doc: `Оплата поставщику №${x.number}`, link: `/payments/${x.id}`, debit: Number(x.amount), credit: 0 });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const opening = side === "client" ? Number(ob?.client_debt ?? 0) : -Number(ob?.our_debt ?? 0);
  const debit = rows.reduce((s, r) => s + r.debit, 0), credit = rows.reduce((s, r) => s + r.credit, 0);
  const closing = opening + debit - credit;
  return { counterparty: cp, from, to, side, opening, rows, debit, credit, closing };
}

/** Сводка долгов: должны нам / должны мы, список должников с просрочкой */
export async function debtSummary(db: DB, p: Principal) {
  assertCan(p, "payments");
  const rows = await q<{ id: number; name: string; kind: string; client_debt: number; our_debt: number; manager: string | null; debt_limit: number }>(db, sql`
    select c.id, c.name, c.kind, b.client_debt::float8, b.our_debt::float8, u.name as manager, c.debt_limit::float8
    from counterparties c join ${balancesSql()} b on b.cp_id = c.id left join users u on u.id = c.manager_id
    where c.deleted_at is null and (b.client_debt <> 0 or b.our_debt <> 0)`);
  const debtors = [];
  for (const r of rows.filter((x) => Number(x.client_debt) > 0).sort((a, b) => Number(b.client_debt) - Number(a.client_debt))) {
    debtors.push({ ...r, client_debt: Number(r.client_debt), overdueDays: await overdueDays(db, r.id, Number(r.client_debt)) });
  }
  const creditors = rows.filter((x) => Number(x.our_debt) > 0).map((r) => ({ ...r, our_debt: Number(r.our_debt) })).sort((a, b) => b.our_debt - a.our_debt);
  return {
    owedToUs: debtors.reduce((s, r) => s + r.client_debt, 0),
    weOwe: creditors.reduce((s, r) => s + r.our_debt, 0),
    debtors, creditors,
  };
}

export async function salesManagers(db: DB) {
  return db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.isSalesManager, true), eq(users.active, true), isNull(users.deletedAt))).orderBy(asc(users.name));
}
export async function activeUsers(db: DB) {
  return db.select({ id: users.id, name: users.name, color: users.color, position: users.position, isSalesManager: users.isSalesManager, isAssembler: users.isAssembler })
    .from(users).where(and(eq(users.active, true), isNull(users.deletedAt))).orderBy(asc(users.name));
}
export { inArray };
