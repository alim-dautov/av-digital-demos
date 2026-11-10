import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { mcpCallLog } from "@/db/schema";
import { principalFromToken } from "@/lib/auth";
import { errorMessage } from "@/lib/action";
import { rateLimit } from "@/lib/rate-limit";
import { runTool, toolJsonSchema, toolsFor } from "@/modules/assistant/tools";

/**
 * MCP-сервер (Streamable HTTP, без сессий): JSON-RPC 2.0 поверх POST, ответ — application/json.
 * Авторизация — API-токен в заголовке Authorization: Bearer demo_…; права токена ограничивают список инструментов.
 */
const PROTOCOL = "2025-06-18";
type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const p = auth?.startsWith("Bearer ") ? await principalFromToken(auth.slice(7).trim()) : null;
  if (!p) return NextResponse.json(fail(null, -32001, "Нужен действующий API-токен: Authorization: Bearer demo_…"), { status: 401, headers: { "www-authenticate": "Bearer" } });
  if (!rateLimit(`mcp:${p.tokenId}`, 120, 60_000).ok) return NextResponse.json(fail(null, -32002, "Слишком много запросов"), { status: 429 });

  const raw = await req.json().catch(() => null);
  if (!raw) return NextResponse.json(fail(null, -32700, "Parse error"), { status: 400 });
  const db = await getDb();
  const batch = Array.isArray(raw);
  const out = [];
  for (const m of (batch ? raw : [raw]) as Rpc[]) {
    const res = await handle(m);
    if (res) out.push(res);
  }
  if (!out.length) return new Response(null, { status: 202 }); // только уведомления
  return NextResponse.json(batch ? out : out[0], { headers: { "cache-control": "no-store" } });

  async function handle(m: Rpc) {
    if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return fail(m?.id, -32600, "Invalid Request");
    const isNotification = m.id === undefined;
    switch (m.method) {
      case "initialize":
        return ok(m.id, {
          protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : PROTOCOL,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "demo-crm", title: "Electro Demo CRM", version: "1.0.0" },
          instructions: "CRM и склад Electro Demo (Казахстан). Деньги в ответах: поля *_kzt — тенге, остальные суммы — тиыны (1 ₸ = 100). Даты — ГГГГ-ММ-ДД, Asia/Almaty.",
        });
      case "ping": return ok(m.id, {});
      case "tools/list":
        return ok(m.id, { tools: toolsFor(p!).map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: toolJsonSchema(t), annotations: { readOnlyHint: !t.write } })) });
      case "tools/call": {
        const name = String(m.params?.name ?? "");
        const args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        const t0 = Date.now();
        try {
          const result = await runTool(db, p!, name, args);
          await db.insert(mcpCallLog).values({ tokenId: p!.tokenId ?? null, tool: name, args, ok: true, durationMs: Date.now() - t0 });
          return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: { result } });
        } catch (e) {
          const error = errorMessage(e);
          await db.insert(mcpCallLog).values({ tokenId: p!.tokenId ?? null, tool: name || "?", args, ok: false, error, durationMs: Date.now() - t0 });
          // ошибка инструмента — результат с isError, чтобы модель могла её прочитать
          return ok(m.id, { content: [{ type: "text", text: error }], isError: true });
        }
      }
      default:
        if (isNotification) return null; // notifications/initialized и пр.
        return fail(m.id, -32601, `Method not found: ${m.method}`);
    }
  }
}

export function GET() {
  // SSE-поток сервер→клиент не используется (сервер без состояния)
  return new Response("Method Not Allowed", { status: 405, headers: { allow: "POST" } });
}
