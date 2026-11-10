import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isFurnitureCompany } from "@/lib/company";
import {
  listFurniturePrices,
  updateFurniturePrices,
} from "@/lib/services/furniture-catalog";

const updateSchema = z.object({
  prices: z
    .array(
      z.object({
        id: z.string().min(1),
        price: z.number().min(0).max(100_000_000).optional(),
        name: z.string().max(200).optional(),
        active: z.boolean().optional(),
        sheetWidth: z.number().int().min(100).max(5000).nullable().optional(),
        sheetHeight: z.number().int().min(100).max(5000).nullable().optional(),
      }),
    )
    .max(500),
});

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "read") && !can(session, "calculator", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isFurnitureCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  return NextResponse.json({ prices: listFurniturePrices(session.companyId) });
}

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "manage")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isFurnitureCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const prices = updateFurniturePrices(session.companyId, parsed.data.prices);
  return NextResponse.json({ ok: true, prices });
}
