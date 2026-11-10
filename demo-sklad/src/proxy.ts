import { NextResponse, type NextRequest } from "next/server";

/** Быстрый редирект неавторизованных на /login (полная проверка сессии — на сервере) */
const PUBLIC = ["/login", "/change-password", "/offline", "/p/", "/api/", "/manifest.webmanifest", "/robots.txt", "/sw.js", "/brand/", "/fonts/", "/_next/", "/favicon"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("demo_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + search)}` : "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|brand/|.*\.(?:png|svg|ico|webmanifest|js|css|woff2?)$).*)"] };
