import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { recalculateAtelierQuote } from "@/lib/domain/atelier-calc";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { saveClientMeasurement } from "@/lib/services/client-measurements";
import type { AtelierQuoteSnapshot } from "@/types";

const bodySchema = z.object({
  id: z.string().nullable().optional(),
  quote: z.record(z.string(), z.unknown()),
  kind: z.enum(["draft", "sheet"]),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "calculator", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  try {
    const quote = recalculateAtelierQuote(
      parsed.data.quote as unknown as AtelierQuoteSnapshot,
    );
    const measurement = saveClientMeasurement(session.companyId, {
      id: parsed.data.id,
      quote,
      kind: parsed.data.kind,
    });
    return NextResponse.json({
      ok: true,
      measurement,
      quote: measurement.quote,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
