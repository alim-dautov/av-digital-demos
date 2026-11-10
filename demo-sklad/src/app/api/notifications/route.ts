import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { listNotifications, markRead, unreadCount } from "@/modules/notifications/service";

export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = await getDb();
  const countOnly = new URL(req.url).searchParams.get("count") === "1";
  const unread = await unreadCount(db, u.id);
  if (countOnly) return NextResponse.json({ unread });
  return NextResponse.json({ unread, items: await listNotifications(db, u.id, 40) });
}

export async function POST(req: Request) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: number };
  await markRead(await getDb(), u.id, typeof body.id === "number" ? body.id : undefined);
  return NextResponse.json({ ok: true });
}
