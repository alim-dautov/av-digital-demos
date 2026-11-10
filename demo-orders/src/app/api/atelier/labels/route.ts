import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import {
  getAtelierLabels,
  getAtelierServicePrices,
  updateAtelierLabels,
  updateAtelierServicePrices,
} from "@/lib/services/atelier-labels";
import { DEFAULT_ATELIER_LABELS } from "@/lib/domain/atelier-labels";

const labelKeys = Object.keys(DEFAULT_ATELIER_LABELS) as [string, ...string[]];

const bodySchema = z.object({
  labels: z
    .partialRecord(z.enum(labelKeys), z.string().trim().max(80))
    .optional(),
  servicePrices: z
    .object({
      sewingSalePerMeter: z.number().min(0),
      sewingCostPerMeter: z.number().min(0),
      tapeSalePerMeter: z.number().min(0),
      tapeCostPerMeter: z.number().min(0),
    })
    .partial()
    .optional(),
});

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "calculator", "read") && !can(session, "settings", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  return NextResponse.json({
    labels: getAtelierLabels(session.companyId),
    servicePrices: getAtelierServicePrices(session.companyId),
  });
}

export async function PUT(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const labels = parsed.data.labels
    ? updateAtelierLabels(session.companyId, parsed.data.labels)
    : getAtelierLabels(session.companyId);
  const servicePrices = parsed.data.servicePrices
    ? updateAtelierServicePrices(session.companyId, parsed.data.servicePrices)
    : getAtelierServicePrices(session.companyId);
  return NextResponse.json({ ok: true, labels, servicePrices });
}
