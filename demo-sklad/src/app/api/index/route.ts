import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { searchIndex } from "@/modules/search/service";

/** Индекс мгновенного поиска: полный (без since) или изменения после since. Права учитываются на сервере. */
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u || u.mustChangePassword) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const since = Number(sp.get("since")) || 0;
  const data = await searchIndex(await getDb(), u, { since, permKey: sp.get("perm") ?? undefined });
  return NextResponse.json(data, { headers: { "cache-control": "private, no-store" } });
}
