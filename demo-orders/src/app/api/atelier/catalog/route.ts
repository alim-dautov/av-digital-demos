import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { getAtelierCatalog, upsertAtelierFabric } from "@/lib/services/atelier-catalog";
import { generateId } from "@/lib/utils";

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "calculator", "read") && !can(session, "settings", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  return NextResponse.json(getAtelierCatalog(session.companyId));
}

const fabricSchema = z.object({
  name: z.string().trim().min(1).max(120),
  salePrice: z.coerce.number().finite().min(0),
  type: z.enum(["tulle", "portiere"]),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "calculator", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  const parsed = fabricSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const fabric = upsertAtelierFabric(session.companyId, {
    name: parsed.data.name,
    type: parsed.data.type,
    article: generateId("art").slice(0, 12),
    salePrice: parsed.data.salePrice,
    costPrice: 0,
    stock: 0,
  });
  return NextResponse.json({ fabric });
}
