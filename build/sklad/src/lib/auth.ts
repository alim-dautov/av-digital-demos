import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, apiTokens } from "@/db/schema";
import { fullPermissions, intersect, type ModuleKey, type Level, type Principal, can, ForbiddenError } from "./rbac";
import { cache } from "react";

export const SESSION_COOKIE = "demo_session";
const SESSION_DAYS = 30;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hashPassword = (pw: string) => bcrypt.hash(pw, 11);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export type SessionUser = Principal & { login: string; mustChangePassword: boolean; color: string; position: string };

export async function createSession(userId: number) {
  const db = await getDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000);
  const h = await headers();
  await db.insert(sessions).values({ id: sha256(token), userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 300) ?? null });
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", expires: expiresAt,
    secure: process.env.NODE_ENV === "production" && !process.env.INSECURE_COOKIES,
  });
}

export async function destroySession() {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (t) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sha256(t)));
  }
  c.delete(SESSION_COOKIE);
}

/** Текущий пользователь (кэшируется в пределах запроса) */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const c = await cookies();
  const t = c.get(SESSION_COOKIE)?.value;
  if (!t) return null;
  const db = await getDb();
  const rows = await db
    .select({ u: users, s: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sha256(t)), gt(sessions.expiresAt, new Date()), eq(users.active, true), isNull(users.deletedAt)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  const u = r.u;
  // отметка активности не чаще раза в 5 минут
  if (!u.lastSeenAt || Date.now() - u.lastSeenAt.getTime() > 300000) {
    db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id)).catch(() => {});
  }
  return {
    id: u.id, name: u.name, login: u.login, isOwner: u.isOwner, isSalesManager: u.isSalesManager, isAssembler: u.isAssembler,
    permissions: u.isOwner ? fullPermissions() : u.permissions, mustChangePassword: u.mustChangePassword, color: u.color, position: u.position,
  };
});

/** Для страниц: требует вход, иначе редирект */
export async function requireUser(module?: ModuleKey, need: Level = "view"): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  if (u.mustChangePassword) redirect("/change-password");
  if (module && !can(u, module, need)) redirect("/?denied=" + module);
  return u;
}

/** Для API: сессия или Bearer-токен */
export async function principalFromRequest(req: Request): Promise<Principal | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return principalFromToken(auth.slice(7).trim());
  const u = await getSessionUser();
  if (u && !u.mustChangePassword) return u;
  return null;
}

export async function principalFromToken(token: string): Promise<Principal | null> {
  const db = await getDb();
  const [row] = await db.select({ t: apiTokens, u: users }).from(apiTokens).innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, sha256(token)), isNull(apiTokens.revokedAt))).limit(1);
  if (!row) return null;
  if (row.t.expiresAt && row.t.expiresAt < new Date()) return null;
  if (!row.u.active || row.u.deletedAt) return null;
  db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.t.id)).catch(() => {});
  const userPerms = row.u.isOwner ? fullPermissions() : row.u.permissions;
  return {
    id: row.u.id, name: `${row.u.name} (API: ${row.t.name})`, isOwner: row.u.isOwner, isSalesManager: row.u.isSalesManager, isAssembler: row.u.isAssembler,
    permissions: intersect(row.t.permissions, userPerms), tokenId: row.t.id,
  };
}

export function newApiToken() {
  const raw = "demo_" + randomBytes(24).toString("base64url");
  return { raw, hash: sha256(raw), prefix: raw.slice(0, 10) };
}

export { ForbiddenError };
