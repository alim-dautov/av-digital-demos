import "server-only";
import { NextResponse } from "next/server";
import { getDb, type DB } from "@/db";
import { getSessionUser } from "./auth";
import type { Principal } from "./rbac";
import { errorMessage } from "./action";

/** Обработчик route.ts с проверкой сессии и единым форматом ошибок */
export function withUser<C = unknown>(fn: (req: Request, ctx: { db: DB; p: Principal; params: C }) => Promise<Response>) {
  return async (req: Request, route: { params: Promise<C> }) => {
    const u = await getSessionUser();
    if (!u || u.mustChangePassword) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    try {
      return await fn(req, { db: await getDb(), p: u, params: await route.params });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      return NextResponse.json({ error: errorMessage(e) }, { status });
    }
  };
}

export function fileResponse(buf: Buffer | Uint8Array, filename: string, mime: string, inline = false) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": mime,
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "cache-control": "private, no-store",
    },
  });
}
export const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
