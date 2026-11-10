import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { fileResponse } from "@/lib/http";
import { linkViewer } from "@/lib/rbac";
import { verifyLink } from "@/lib/sign";
import { addDays, today } from "@/lib/format";
import { PDF } from "@/lib/pdf/kit";
import { reconPdf } from "@/lib/pdf/docs";
import { reconciliation } from "@/modules/counterparties/service";
import { docCompany } from "@/lib/pdf/company";
import { cpByPortalToken, portalViewer } from "@/modules/counterparties/portal";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const D = /^\d{4}-\d{2}-\d{2}$/;

/** Акт сверки: по сессии (?from&to&side), по подписанной ссылке (?t=token) или из кабинета клиента (?portal=token&from&to) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const id = Number((await params).id);
  const db = await getDb();
  let from = url.searchParams.get("from") ?? addDays(today(), -89);
  let to = url.searchParams.get("to") ?? today();
  let side = (url.searchParams.get("side") === "supplier" ? "supplier" : "client") as "client" | "supplier";
  let p = await getSessionUser();
  const t = url.searchParams.get("t");
  if (t) {
    const link = verifyLink<{ t: string; id: number; from: string; to: string; side: "client" | "supplier" }>(t);
    if (!link || link.t !== "recon" || link.id !== id) return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 403 });
    ({ from, to, side } = link);
    p = linkViewer({ counterparties: "view" }) as typeof p;
  }
  const portal = url.searchParams.get("portal");
  if (portal) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`portal-pdf:${ip}`, 60, 60_000).ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    const cp = await cpByPortalToken(db, portal);
    if (!cp || cp.id !== id) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 403 });
    side = cp.kind === "supplier" ? "supplier" : "client";
    p = portalViewer() as typeof p;
  }
  if (!p || p.mustChangePassword) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (!D.test(from) || !D.test(to)) return NextResponse.json({ error: "Неверный период" }, { status: 400 });
  try {
    const r = await reconciliation(db, p, id, from, to, side);
    const buf = await reconPdf(await docCompany(db), r);
    return fileResponse(buf, `Акт_сверки_${r.counterparty.name}_${from}_${to}.pdf`, PDF, true);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 500 });
  }
}
