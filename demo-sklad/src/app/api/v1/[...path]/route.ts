import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { principalFromToken } from "@/lib/auth";
import { errorMessage } from "@/lib/action";
import { rateLimit } from "@/lib/rate-limit";
import { checkAccess, matchRoute } from "@/modules/api/routes";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

async function handle(req: Request, route: { params: Promise<{ path: string[] }> }) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "Нужен заголовок Authorization: Bearer <токен>" }, 401);
  const p = await principalFromToken(auth.slice(7).trim());
  if (!p) return json({ error: "Токен недействителен, отозван или истёк" }, 401);
  const rl = rateLimit(`api:${p.tokenId}`, 120, 60_000);
  if (!rl.ok) return json({ error: "Слишком много запросов" }, 429, { "retry-after": String(rl.retryAfter) });
  const path = "/" + (await route.params).path.join("/");
  const m = matchRoute(req.method, path);
  if (!m) return json({ error: `Нет метода ${req.method} ${path}` }, 404);
  try {
    checkAccess(p, m.route);
    const url = new URL(req.url);
    const rawQuery = Object.fromEntries(url.searchParams);
    const q = m.route.query ? m.route.query.safeParse(rawQuery) : { success: true as const, data: {} };
    if (!q.success) return json({ error: q.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
    let body: unknown;
    if (m.route.body) {
      const b = m.route.body.safeParse(await req.json().catch(() => undefined));
      if (!b.success) return json({ error: b.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
      body = b.data;
    }
    const data = await m.route.handler({ db: await getDb(), p, params: m.params, query: q.data as Record<string, unknown>, body });
    return json({ data: data ?? null }, m.route.method === "POST" ? 201 : 200);
  } catch (e) {
    return json({ error: errorMessage(e) }, (e as { status?: number }).status ?? 500);
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
