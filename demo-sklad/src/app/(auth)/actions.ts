"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { audit } from "@/lib/audit";
import { changeOwnPassword } from "@/modules/users/service";

export type FormState = { error?: string } | undefined;

let dummy: string | null = null;
async function dummyHash() {
  if (!dummy) dummy = await hashPassword("timing-safe-dummy-password");
  return dummy;
}

export async function loginAction(_: FormState, form: FormData): Promise<FormState> {
  const login = String(form.get("login") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!login || !password) return { error: "Введите логин и пароль" };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const rl = rateLimit(`login:${ip}:${login}`, 5, 15 * 60_000);
  const rlIp = rateLimit(`login-ip:${ip}`, 30, 15 * 60_000);
  if (!rl.ok || !rlIp.ok) return { error: `Слишком много попыток. Повторите через ${Math.ceil(Math.max(rl.retryAfter, rlIp.retryAfter) / 60)} мин.` };
  const db = await getDb();
  const [u] = await db.select().from(users).where(and(eq(users.login, login), isNull(users.deletedAt)));
  // одинаковое время ответа для несуществующих логинов
  const ok = u ? await verifyPassword(password, u.passwordHash) : await verifyPassword(password, await dummyHash()).then(() => false);
  if (!u || !ok) return { error: "Неверный логин или пароль" };
  if (!u.active) return { error: "Учётная запись отключена. Обратитесь к руководителю." };
  resetRateLimit(`login:${ip}:${login}`);
  await createSession(u.id);
  await audit(db, { id: u.id, name: u.name, isOwner: u.isOwner, isSalesManager: false, isAssembler: false, permissions: u.permissions }, "login", "user", u.id, `Вход: ${u.name}`);
  const next = String(form.get("next") ?? "/");
  redirect(u.mustChangePassword ? "/change-password" : next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function demoLoginAction(form: FormData): Promise<void> {
  if (process.env.DEMO_MODE !== "1") redirect("/login");
  const login = String(form.get("login") ?? "").trim().toLowerCase();
  const db = await getDb();
  const [u] = await db.select().from(users).where(and(eq(users.login, login), isNull(users.deletedAt), eq(users.active, true)));
  if (!u) redirect("/login");
  await createSession(u.id);
  redirect("/");
}

export async function changePasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  const next = String(form.get("password") ?? "");
  const repeat = String(form.get("repeat") ?? "");
  if (next !== repeat) return { error: "Пароли не совпадают" };
  try {
    const db = await getDb();
    await changeOwnPassword(db, u.id, u.mustChangePassword ? null : String(form.get("current") ?? ""), next);
    await audit(db, u, "update", "user", u.id, "Смена пароля");
  } catch (e) {
    return { error: (e as Error).message };
  }
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
