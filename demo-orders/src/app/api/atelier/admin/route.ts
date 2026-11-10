import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import {
  upsertAtelierFabric,
  updateCatalogPrices,
  getAtelierCatalog,
} from "@/lib/services/atelier-catalog";

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "read") && !can(session, "calculator", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  return NextResponse.json(getAtelierCatalog(session.companyId));
}

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "manage") && !can(session, "settings", "write")) {
    // ADMIN has manage; allow ADMIN/OWNER
    if (!can(session, "settings", "manage")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }

  const body = await req.json();
  if (body.fabric) {
    const fabric = upsertAtelierFabric(session.companyId, body.fabric);
    return NextResponse.json({ ok: true, fabric });
  }
  if (body.prices) {
    const catalog = updateCatalogPrices(session.companyId, body.prices);
    return NextResponse.json({ ok: true, catalog });
  }
  return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
}
