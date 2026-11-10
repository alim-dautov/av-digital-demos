import { SESSION_COOKIE } from "@/lib/auth";
import { COMPANY_APPS } from "@/lib/company-apps";

/** Sessions issued before the cookie had an explicit path were scoped to company app folders. */
const SESSION_COOKIE_PATHS = ["/", "/c", ...COMPANY_APPS.map((app) => `/c/${app.slug}`)];

/**
 * Expires the session cookie on every path it may have been stored under.
 * A leftover path-scoped cookie would keep the previous user signed in inside a company app.
 * Next's cookie API keeps one Set-Cookie per name, so the headers are written by hand.
 */
export function expireSessionCookies(headers: Headers): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  for (const path of SESSION_COOKIE_PATHS) {
    headers.append(
      "Set-Cookie",
      `${SESSION_COOKIE}=; Path=${path}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; SameSite=Lax${secure}`,
    );
  }
}
