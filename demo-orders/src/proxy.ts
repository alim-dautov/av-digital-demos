import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import {
  canAccessCompany,
  findActiveUser,
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
} from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import type { Resource } from "@/lib/rbac";
import {
  COMPANY_APP_HEADER,
  COMPANY_LOCK_HEADER,
  companyAppFromReferer,
  getCompanyAppBySlug,
  matchCompanyPath,
  prefixAppPath,
} from "@/lib/company-apps";
import { getAppOrigin, getAuthSecret } from "@/lib/env";
import { GROK_ENDPOINT_PATH } from "@/lib/integrations/grok/endpoint";

const PUBLIC_PREFIXES = ["/app-icons/", "/fonts/"];
const PUBLIC_PATHS = new Set([
  "/favicon.ico",
  "/manifest.webmanifest",
  "/sw.js",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  GROK_ENDPOINT_PATH,
]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return /^\/c\/[a-z0-9-]+\/(?:manifest\.webmanifest|sw\.js)$/.test(pathname);
}

function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

function isSameOrigin(request: NextRequest) {
  const origin = requestOrigin(request);
  if (!origin) return false;
  if (origin === getAppOrigin()) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cleanHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete(COMPANY_APP_HEADER);
  headers.delete(COMPANY_LOCK_HEADER);
  return headers;
}

function nextClean(request: NextRequest) {
  return NextResponse.next({ request: { headers: cleanHeaders(request) } });
}

async function readSession(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getAuthSecret());
    return {
      userId: String(payload.id),
      companyId: String(payload.companyId),
      sessionVersion: Number(payload.sv ?? 0),
      expiresAt: typeof payload.exp === "number" ? payload.exp : 0,
    };
  } catch {
    return null;
  }
}

function shouldRefreshSession(session: { expiresAt: number }) {
  return session.expiresAt > 0 && session.expiresAt - Math.floor(Date.now() / 1000) < 7 * 24 * 60 * 60;
}

function refererSlug(request: NextRequest): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return companyAppFromReferer(request.headers.get("referer"), host)?.slug ?? null;
}

function isDocument(request: NextRequest) {
  return request.headers.get("sec-fetch-dest") === "document";
}

function isInAppPath(pathname: string) {
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/app-icons/") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/c/")
  ) {
    return false;
  }
  return !pathname.includes(".");
}

// Route-level enforcement complements the existing role and per-user checks.
const API_MODULES: Record<string, Resource> = {
  analytics: "analytics", attendance: "attendance", calculator: "calculator",
  cash: "finance", clients: "clients", dashboard: "dashboard", employees: "employees",
  "expense-categories": "costing", furniture: "calculator", gallery: "gallery",
  inventory: "inventory", measurements: "calendar", orders: "orders", payroll: "payroll",
  production: "production", purchases: "purchases", renovation: "calculator", reports: "reports",
  tasks: "tasks", voice: "assistant", notifications: "notifications",
};
const PAGE_MODULES: Record<string, Resource> = {
  orders: "orders", clients: "clients", calculator: "calculator", production: "production",
  workshop: "workshop", inventory: "inventory", employees: "employees", payroll: "payroll",
  tasks: "tasks", reports: "reports", finance: "finance", costing: "costing", checklists: "checklists",
  analytics: "analytics", attendance: "attendance", assistant: "assistant", notifications: "notifications",
  calendar: "calendar", measurements: "calculator", gallery: "gallery", proposals: "proposals", purchases: "purchases",
};
function disabledForPath(pathname: string, companyId: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  const api = segments[0] === "api";
  let resource = api ? API_MODULES[segments[1]] : PAGE_MODULES[segments[0]];
  if (api && segments[1] === "atelier" && ["quote", "measurements", "catalog", "labels", "admin"].includes(segments[2])) resource = "calculator";
  if (api && segments[1] === "me" && segments[2] === "payroll") resource = "payroll";
  if (api && segments[1] === "me" && segments[2] === "work") resource = "orders";
  if (!resource) return false;
  return getData().companies.find((c) => c.id === companyId)?.disabledModules?.includes(resource) ?? false;
}
function blockedModule(request: NextRequest, pathname: string, companyId: string, base = "") {
  if (!disabledForPath(pathname, companyId)) return null;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Модуль отключён в настройках компании" }, { status: 403 });
  return NextResponse.redirect(new URL(`${base}/settings`, request.url));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (
    isApi &&
    MUTATING_METHODS.has(request.method) &&
    pathname !== GROK_ENDPOINT_PATH &&
    !isSameOrigin(request)
  ) {
    return NextResponse.json({ error: "Запрос отклонён" }, { status: 403 });
  }

  if (isPublic(pathname)) return nextClean(request);

  const company = matchCompanyPath(pathname);
  if (company && pathname === `/c/${company.app.slug}`) {
    // A plain URL keeps the trailing slash. NextURL would strip it and loop.
    const url = new URL(request.url);
    url.pathname = `/c/${company.app.slug}/`;
    return NextResponse.redirect(url);
  }

  if (
    !company &&
    isDocument(request) &&
    isInAppPath(pathname) &&
    request.method === "GET"
  ) {
    const slug = refererSlug(request);
    if (slug) {
      const url = request.nextUrl.clone();
      url.pathname = prefixAppPath(slug, pathname).split("?")[0].split("#")[0];
      return NextResponse.redirect(url);
    }
  }

  const session = await readSession(request);

  if (company) {
    const base = `/c/${company.app.slug}`;
    if (company.rest === "/denied") {
      const headers = cleanHeaders(request);
      headers.set(COMPANY_APP_HEADER, company.app.slug);
      return NextResponse.next({ request: { headers } });
    }

    if (company.rest === "/login") {
      if (session) return NextResponse.redirect(new URL(`${base}/`, request.url));
      return rewriteCompany(request, company.app.slug, company.app.companyId, "/login");
    }

    if (!session) {
      if (company.rest.startsWith("/api/")) {
        return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
      }
      const url = new URL(`${base}/login`, request.url);
      url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      return NextResponse.redirect(url);
    }

    await bootstrap();
    const user = findActiveUser(session.userId);
    if (
      !user ||
      (user.sessionVersion ?? 0) !== session.sessionVersion ||
      !canAccessCompany(user, company.app.companyId)
    ) {
      return NextResponse.redirect(new URL(`${base}/denied`, request.url));
    }

    const blocked = blockedModule(request, company.rest, company.app.companyId, base);
    if (blocked) return blocked;
    const response = rewriteCompany(
      request,
      company.app.slug,
      company.app.companyId,
      company.rest === "/" ? "/" : company.rest,
    );
    if (shouldRefreshSession(session)) {
      const token = await signSessionToken(user.id, company.app.companyId);
      response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    }
    return response;
  }

  if (pathname === "/login") {
    return session ? NextResponse.redirect(new URL("/", request.url)) : nextClean(request);
  }

  if (!session) {
    if (isApi) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const response = companyApiResponse(request, isApi) ?? nextClean(request);
  // Refresh only near expiry. This keeps installed PWAs alive without
  // rotating the cookie on every request or weakening server-side checks.
  const user = await (async () => {
    await bootstrap();
    return findActiveUser(session.userId);
  })();
  const app = isApi ? getCompanyAppBySlug(refererSlug(request) ?? "") : null;
  const effectiveCompanyId = app && user && canAccessCompany(user, app.companyId) ? app.companyId : session.companyId;
  if (user && (user.sessionVersion ?? 0) === session.sessionVersion && canAccessCompany(user, effectiveCompanyId)) {
    const blocked = blockedModule(request, pathname, effectiveCompanyId);
    if (blocked) return blocked;
  }
  if (user && (user.sessionVersion ?? 0) === session.sessionVersion && shouldRefreshSession(session)) {
    const token = await signSessionToken(user.id, session.companyId);
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  }
  return response;
}

/**
 * Plain /api/* calls made from inside /c/<slug>/ act in that company, like the
 * pages do. The cookie may still carry another company (it is re-signed only near
 * expiry), so without this an uploaded photo looked up the order in the wrong
 * company and got «Запись не найдена». getSession() still checks access.
 */
function companyApiResponse(request: NextRequest, isApi: boolean) {
  if (!isApi) return null;
  const slug = refererSlug(request);
  const app = slug ? getCompanyAppBySlug(slug) : null;
  if (!app) return null;
  const headers = cleanHeaders(request);
  headers.set(COMPANY_APP_HEADER, app.slug);
  headers.set(COMPANY_LOCK_HEADER, app.companyId);
  return NextResponse.next({ request: { headers } });
}

function rewriteCompany(
  request: NextRequest,
  slug: string,
  companyId: string,
  pathname: string,
) {
  const headers = cleanHeaders(request);
  headers.set(COMPANY_APP_HEADER, slug);
  headers.set(COMPANY_LOCK_HEADER, companyId);
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url, { request: { headers } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
