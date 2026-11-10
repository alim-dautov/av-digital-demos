import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { runChecks } from "@/modules/scheduler/checks";
import { resetDemo } from "@/db/demo-reset";

/** Ручной/внешний запуск проверок: владелец из интерфейса или планировщик с заголовком x-cron-secret = CRON_SECRET */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET, given = req.headers.get("x-cron-secret") ?? "";
  const bySecret = !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!bySecret) {
    const u = await getSessionUser();
    if (!u?.isOwner) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  if (new URL(req.url).searchParams.get("reset") === "1" && bySecret && process.env.DEMO_MODE === "1") {
    await resetDemo();
    return NextResponse.json({ ok: true, reset: true });
  }
  return NextResponse.json({ ok: true, ...(await runChecks(await getDb())) });
}
