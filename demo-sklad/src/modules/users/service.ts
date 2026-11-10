import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { apiTokens, auditLog, sessions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ForbiddenError, MODULE_KEYS, FLAG_KEYS, NotFoundError, ValidationError, type Permissions, type Principal } from "@/lib/rbac";
import { taskStats } from "@/modules/tasks/service";
import { createHash } from "node:crypto";

const assertOwner = (p: Principal) => { if (!p.isOwner || p.tokenId) throw new ForbiddenError("Только владелец"); };

const levelSchema = z.enum(["none", "view", "full"]);
export const permissionsSchema = z.object({
  modules: z.object(Object.fromEntries(MODULE_KEYS.map((m) => [m, levelSchema.optional()]))).partial(),
  flags: z.object(Object.fromEntries(FLAG_KEYS.map((f) => [f, z.boolean().optional()]))).partial(),
});

export const userInput = z.object({
  login: z.string().trim().min(2).max(50).regex(/^[a-z0-9._-]+$/i, "Логин: латиница, цифры, . _ -"),
  name: z.string().trim().min(1).max(100),
  position: z.string().max(100).default(""),
  phone: z.string().max(40).nullable().optional(),
  isSalesManager: z.boolean().default(false),
  isAssembler: z.boolean().default(false),
  active: z.boolean().default(true),
  weeklyPlan: z.number().int().min(0).default(0),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#0B2B54"),
  permissions: permissionsSchema,
});

export const tempPassword = () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 8);

export async function listUsers(db: DB, p: Principal) {
  assertOwner(p);
  return db.select({ id: users.id, login: users.login, name: users.name, position: users.position, phone: users.phone, isOwner: users.isOwner, isSalesManager: users.isSalesManager,
    isAssembler: users.isAssembler, active: users.active, permissions: users.permissions, weeklyPlan: users.weeklyPlan, color: users.color, lastSeenAt: users.lastSeenAt, mustChangePassword: users.mustChangePassword })
    .from(users).where(isNull(users.deletedAt)).orderBy(desc(users.isOwner), asc(users.name));
}

export async function createUser(db: DB, p: Principal, input: z.infer<typeof userInput>) {
  assertOwner(p);
  const [ex] = await db.select().from(users).where(eq(users.login, input.login.toLowerCase()));
  if (ex) throw new ValidationError("Логин занят");
  const pw = tempPassword();
  const [u] = await db.insert(users).values({ ...input, login: input.login.toLowerCase(), permissions: input.permissions as Permissions, passwordHash: await bcrypt.hash(pw, 11), mustChangePassword: true }).returning();
  await audit(db, p, "create", "user", u.id, `Создан сотрудник ${u.name}`);
  return { id: u.id, tempPassword: pw };
}

export async function updateUser(db: DB, p: Principal, id: number, input: z.infer<typeof userInput>) {
  assertOwner(p);
  const [u0] = await db.select().from(users).where(eq(users.id, id));
  if (!u0) throw new NotFoundError();
  if (u0.isOwner && !input.active) throw new ValidationError("Нельзя деактивировать владельца");
  const [ex] = await db.select().from(users).where(and(eq(users.login, input.login.toLowerCase()), sql`${users.id} <> ${id}`));
  if (ex) throw new ValidationError("Логин занят");
  await db.update(users).set({ ...input, login: input.login.toLowerCase(), permissions: input.permissions as Permissions }).where(eq(users.id, id));
  if (!input.active) await db.delete(sessions).where(eq(sessions.userId, id));
  await audit(db, p, "update", "user", id, `Изменён сотрудник ${input.name}`,
    JSON.stringify(u0.permissions) !== JSON.stringify(input.permissions) ? { permissions: { before: u0.permissions, after: input.permissions } } : undefined);
}

export async function resetPassword(db: DB, p: Principal, id: number) {
  assertOwner(p);
  const pw = tempPassword();
  await db.update(users).set({ passwordHash: await bcrypt.hash(pw, 11), mustChangePassword: true }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await audit(db, p, "update", "user", id, "Сброс пароля");
  return pw;
}

export async function deleteUser(db: DB, p: Principal, id: number) {
  assertOwner(p);
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) throw new NotFoundError();
  if (u.isOwner) throw new ValidationError("Нельзя удалить владельца");
  await db.update(users).set({ deletedAt: new Date(), active: false, login: `${u.login}#deleted${id}` }).where(eq(users.id, id));
  await db.delete(sessions).where(eq(sessions.userId, id));
  await audit(db, p, "delete", "user", id, `Удалён сотрудник ${u.name}`);
}

export async function changeOwnPassword(db: DB, userId: number, current: string | null, next: string) {
  if (next.length < 8) throw new ValidationError("Пароль — минимум 8 символов");
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u) throw new NotFoundError();
  if (current !== null && !(await bcrypt.compare(current, u.passwordHash))) throw new ValidationError("Текущий пароль неверный");
  if (await bcrypt.compare(next, u.passwordHash)) throw new ValidationError("Новый пароль должен отличаться от временного");
  await db.update(users).set({ passwordHash: await bcrypt.hash(next, 11), mustChangePassword: false }).where(eq(users.id, userId));
}

/* ───── Команда ───── */

export async function teamOverview(db: DB, from: string, to: string) {
  const ppl = await db.select({ id: users.id, name: users.name, position: users.position, color: users.color, lastSeenAt: users.lastSeenAt, isSalesManager: users.isSalesManager })
    .from(users).where(and(eq(users.active, true), isNull(users.deletedAt))).orderBy(asc(users.name));
  const stats = await taskStats(db, from, to);
  const actions = await q<{ user_id: number; c: number; last: string }>(db, sql`select user_id, count(*)::int c, max(created_at)::text last from audit_log
    where user_id is not null and (created_at at time zone 'Asia/Almaty')::date between ${from} and ${to} group by user_id`);
  const sales = await q<{ manager_id: number; revenue: number; orders: number }>(db, sql`select coalesce(o.manager_id, c.manager_id) manager_id,
    round(sum(case when s.kind='return' then -s.total else s.total end))::float8 revenue, count(distinct s.order_id)::int orders
    from shipments s join counterparties c on c.id = s.counterparty_id left join orders o on o.id = s.order_id
    where s.posted and s.deleted_at is null and s.date between ${from} and ${to} group by 1`);
  const maxOpen = 10; // 10 открытых задач = 100% нагрузки
  return ppl.map((u) => {
    const t = stats.find((s) => s.user_id === u.id);
    const a = actions.find((s) => s.user_id === u.id);
    const sl = sales.find((s) => s.manager_id === u.id);
    const open = t?.open ?? 0, overdue = t?.overdue ?? 0;
    return {
      ...u, open, overdue, done: t?.done ?? 0, onTimePct: t?.with_due ? (t.on_time / t.with_due) * 100 : null,
      actions: a?.c ?? 0, lastAction: a?.last ?? null, revenue: Number(sl?.revenue ?? 0), orders: sl?.orders ?? 0,
      loadPct: Math.min(150, Math.round(((open + overdue) / maxOpen) * 100)),
      score: (a?.c ?? 0) + (t?.done ?? 0) * 5 + Math.round(Number(sl?.revenue ?? 0) / 10000000),
    };
  });
}

export async function recentActivity(db: DB, userId: number | null, limit = 30) {
  return db.select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, entityId: auditLog.entityId, summary: auditLog.summary, createdAt: auditLog.createdAt, userName: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(userId ? eq(auditLog.userId, userId) : undefined).orderBy(desc(auditLog.id)).limit(limit);
}

/* ───── API-токены ───── */

export async function listTokens(db: DB, p: Principal) {
  assertOwner(p);
  return db.select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, permissions: apiTokens.permissions, expiresAt: apiTokens.expiresAt, lastUsedAt: apiTokens.lastUsedAt,
    revokedAt: apiTokens.revokedAt, createdAt: apiTokens.createdAt, userName: users.name }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId)).orderBy(desc(apiTokens.id));
}

export async function createToken(db: DB, p: Principal, input: { name: string; permissions: Permissions; expiresInDays: number | null }) {
  assertOwner(p);
  const raw = "demo_" + randomBytes(24).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  const [t] = await db.insert(apiTokens).values({ name: input.name, prefix: raw.slice(0, 10), tokenHash: hash, permissions: input.permissions, userId: p.id,
    expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : null }).returning();
  await audit(db, p, "create", "api_token", t.id, `Создан API-токен «${t.name}»`, input.permissions);
  return { id: t.id, token: raw };
}

export async function revokeToken(db: DB, p: Principal, id: number) {
  assertOwner(p);
  await db.update(apiTokens).set({ revokedAt: new Date() }).where(eq(apiTokens.id, id));
  await audit(db, p, "delete", "api_token", id, "Отозван API-токен");
}
