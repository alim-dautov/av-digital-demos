import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { clientHistory } from "@/modules/search/service";

/** Что клиент брал раньше — для подъёма этих товаров в поиске заявки */
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u || u.mustChangePassword) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cp = Number(new URL(req.url).searchParams.get("cp"));
  if (!cp) return NextResponse.json([]);
  return NextResponse.json(await clientHistory(await getDb(), u, cp), { headers: { "cache-control": "private, max-age=300" } });
}
