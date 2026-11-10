import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { createPurchase, listPurchases } from "@/lib/services/purchases";
import { CATEGORY_LABELS } from "@/types";

const itemSchema = z.object({
  name: z.string().trim().min(1),
  category: z.enum(Object.keys(CATEGORY_LABELS) as [string, ...string[]]),
  quantity: z.coerce.number().positive(),
  unit: z.string().trim().min(1).default("шт"),
  price: z.coerce.number().min(0),
  lengthM: z.coerce.number().positive().nullable().optional(),
});

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "purchases", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  return NextResponse.json({ purchases: listPurchases(session.companyId) });
}

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "purchases", "write") || !isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = z
    .object({
      supplier: z.string().trim().min(1),
      comment: z.string().max(1000).optional(),
      items: z.array(itemSchema).min(1),
    })
    .safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  try {
    const purchase = createPurchase(session.companyId, {
      supplier: parsed.data.supplier,
      comment: parsed.data.comment,
      items: parsed.data.items.map((item) => ({
        ...item,
        category: item.category as never,
        lengthM: item.lengthM ?? null,
      })),
    });
    return NextResponse.json({ purchase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
