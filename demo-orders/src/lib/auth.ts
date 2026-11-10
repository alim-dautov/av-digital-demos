import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { getData } from "@/lib/db";
import { bootstrap } from "@/lib/bootstrap";
import {
  COMPANY_APP_HEADER,
  COMPANY_LOCK_HEADER,
  getCompanyAppBySlug,
  prefixAppPath,
} from "@/lib/company-apps";
import { getAuthSecret, isProduction } from "@/lib/env";
import { can, type Action, type Resource } from "@/lib/rbac";
import { canAccessCompany, toSessionUser } from "@/lib/session-user";
import type { Company, SessionUser, UserAccount } from "@/types";

export const SESSION_COOKIE = "mebeldemo_session";
// The cookie is renewed by the request proxy while the account is active. A
// longer absolute window prevents an iPad PWA from losing a session after a
// weekend while the JWT still remains short enough to be rotated regularly.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isProduction,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 404,
  ) {
    super(message);
  }
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

let dummyHash: string | null = null;
function getDummyHash() {
  if (!dummyHash) dummyHash = bcrypt.hashSync("mebeldemo-dummy-password", 10);
  return dummyHash;
}

export { canAccessCompany, toSessionUser };

export function accessibleCompanies(
  user: Pick<UserAccount, "role" | "companyId">,
  companies: Company[],
) {
  return companies.filter((c) => canAccessCompany(user, c.id));
}

export async function signSessionToken(userId: string, companyId: string) {
  const sessionVersion = getData().users.find((user) => user.id === userId)?.sessionVersion ?? 0;
  return new SignJWT({ id: userId, companyId, sv: sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret());
}

async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Возвращает аккаунт текущего пользователя из базы, если он активен. */
export function findActiveUser(userId: string): UserAccount | null {
  return getData().users.find((u) => u.id === userId && u.isActive) ?? null;
}

export async function getSession(): Promise<SessionUser | null> {
  await bootstrap();
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    const user = findActiveUser(String(payload.id));
    if (!user) return null;
    if (Number(payload.sv ?? 0) !== (user.sessionVersion ?? 0)) return null;
    let companyId = String(payload.companyId);
    const requestHeaders = await headers();
    const app = getCompanyAppBySlug(requestHeaders.get(COMPANY_APP_HEADER) ?? "");
    const lock = requestHeaders.get(COMPANY_LOCK_HEADER);
    if (app && lock === app.companyId && canAccessCompany(user, app.companyId)) {
      companyId = app.companyId;
    }
    if (!canAccessCompany(user, companyId)) return null;
    if (!getData().companies.some((c) => c.id === companyId)) return null;
    return { ...toSessionUser(user, companyId), disabledModules: getData().companies.find((c) => c.id === companyId)?.disabledModules ?? [] };
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new AuthError("Требуется авторизация", 401);
  return session;
}

/** Для серверных страниц: редиректит на логин или на главную, если прав нет. */
export async function redirectInCompany(path: string): Promise<never> {
  const slug = (await headers()).get(COMPANY_APP_HEADER);
  redirect(slug ? prefixAppPath(slug, path) : path);
}

export async function requirePageAccess(
  resource: Resource,
  action: Action = "read",
): Promise<SessionUser> {
  const session = await getSession();
  if (!session) return redirectInCompany("/login");
  if (!can(session, resource, action)) return redirectInCompany(resource === "dashboard" ? "/settings" : "/");
  return session;
}

/** Finds an active account by login or email (case-insensitive). */
export function findUserByIdentifier(identifier: string): UserAccount | null {
  const key = identifier.toLowerCase().trim();
  if (!key) return null;
  return (
    getData().users.find(
      (u) => u.isActive && (u.login?.toLowerCase() === key || (u.email !== "" && u.email === key)),
    ) ?? null
  );
}

export async function loginWithCredentials(identifier: string, password: string) {
  await bootstrap();
  const user = findUserByIdentifier(identifier);
  if (!user) {
    await verifyPassword(password, getDummyHash());
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  const token = await signSessionToken(user.id, user.companyId);
  await setSessionCookie(token);
  return toSessionUser(user, user.companyId);
}

export async function switchCompany(companyId: string) {
  const session = await requireSession();
  const user = findActiveUser(session.id);
  if (!user) throw new AuthError("Требуется авторизация", 401);
  const company = getData().companies.find((c) => c.id === companyId);
  if (!company) throw new AuthError("Компания не найдена", 404);
  if (!canAccessCompany(user, companyId)) {
    throw new AuthError("Нет доступа к компании", 403);
  }
  const token = await signSessionToken(user.id, companyId);
  await setSessionCookie(token);
  return toSessionUser(user, companyId);
}
