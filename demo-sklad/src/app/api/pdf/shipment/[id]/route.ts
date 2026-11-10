import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { errorMessage } from "@/lib/action";
import { fileResponse } from "@/lib/http";
import { PDF } from "@/lib/pdf/kit";
import { shipmentPdf } from "@/lib/pdf/docs";
import { rateLimit } from "@/lib/rate-limit";
import type { Principal } from "@/lib/rbac";
import { getShipment } from "@/modules/shipments/service";
import { cpByPortalToken, portalViewer } from "@/modules/counterparties/portal";
import { docCompany } from "@/lib/pdf/company";

export const runtime = "nodejs";

/** Накладная / возврат: по сессии или из кабинета клиента (?portal=<token>, только свои документы) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const portal = new URL(req.url).searchParams.get("portal");
  const db = await getDb();
  let p: Principal | null = null;
  let cpId: number | null = null;
  if (portal) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (!rateLimit(`portal-pdf:${ip}`, 60, 60_000).ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
    const cp = await cpByPortalToken(db, portal);
    if (!cp) return NextResponse.json({ error: "Ссылка недействительна" }, { status: 403 });
    p = portalViewer();
    cpId = cp.id;
  } else {
    const u = await getSessionUser();
    if (!u || u.mustChangePassword) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    p = u;
  }
  try {
    const sh = await getShipment(db, p, id);
    if (cpId != null && (sh.counterpartyId !== cpId || !sh.posted)) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
    const company = await docCompany(db);
    const buf = await shipmentPdf(company, {
      kind: sh.kind, number: sh.number, date: sh.date, orderNumber: sh.order?.number, total: sh.total, comment: sh.comment,
      client: { name: sh.counterparty.name, phone: sh.counterparty.phone, details: [sh.counterparty.bin && `БИН/ИИН ${sh.counterparty.bin}`, sh.counterparty.address].filter(Boolean).join(", ") },
      items: sh.items.map((i) => ({ name: i.name, unit: i.unit, qty: Number(i.qty), price: i.price })),
    });
    return fileResponse(buf, `${sh.kind === "return" ? "Возврат" : "Накладная"}_${sh.number}.pdf`, PDF, true);
  } catch (e) {
    return NextResponse.json({ error: errorMessage(e) }, { status: (e as { status?: number }).status ?? 500 });
  }
}
