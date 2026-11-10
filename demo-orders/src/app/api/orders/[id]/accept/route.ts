import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { isTextilesCompany } from "@/lib/company";
import { can } from "@/lib/rbac";
import { acceptOrder, WorkshopError } from "@/lib/services/workshop";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "workshop", "write") || !isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const { order } = await acceptOrder(session.companyId, id, {
      id: session.id,
      name: session.fullName,
      firstName: session.firstName,
    });
    return NextResponse.json({ order });
  } catch (e) {
    if (e instanceof WorkshopError) {
      return NextResponse.json({ error: e.message, order: e.order }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось принять заказ" }, { status: 500 });
  }
}
