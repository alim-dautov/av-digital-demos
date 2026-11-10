import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import { getDataPath, resetData } from "@/lib/db/store";
import { ensureDatabase } from "@/lib/db/seed";

/** Демо: пересоздать данные. Только DEMO_MODE=1 и заголовок x-cron-secret = CRON_SECRET. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  const ok = process.env.DEMO_MODE === "1" && secret.length >= 16 && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  const file = getDataPath();
  if (fs.existsSync(file)) fs.unlinkSync(file);
  resetData();
  ensureDatabase();
  return NextResponse.json({ ok: true });
}
