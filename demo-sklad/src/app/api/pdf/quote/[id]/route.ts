import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { fileResponse } from "@/lib/http";
import { PDF } from "@/lib/pdf/kit";
import { quotePdf } from "@/lib/pdf/docs";
import { getQuote } from "@/modules/quotes/service";
import { docCompany } from "@/lib/pdf/company";

export const runtime = "nodejs";

/** КП в PDF: по сессии или по публичному токену (?t=shareToken) — наценка в любом случае не раскрывается */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const token = new URL(req.url).searchParams.get("t") ?? undefined;
  const db = await getDb();
  const u = token ? null : await getSessionUser();
  if (!token && (!u || u.mustChangePassword)) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  try {
    const qq = await getQuote(db, u, id, token);
    const buf = await quotePdf(await docCompany(db), {
      number: qq.number, date: qq.createdAt.toISOString().slice(0, 10), clientName: qq.clientName, clientDetails: qq.clientDetails, objectName: qq.objectName,
      validUntil: qq.validUntil, terms: qq.terms, lines: qq.lines, total: qq.total, author: qq.author,
    });
    return fileResponse(buf, `КП_${qq.number}.pdf`, PDF, true);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 500 });
  }
}
