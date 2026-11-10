import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { canDeleteOrders } from "@/lib/rbac";
import { getDeletionSummary, OrderDeletionError } from "@/lib/services/order-deletion";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canDeleteOrders(session)) {
    return NextResponse.json({ error: "Нет права на удаление заказов" }, { status: 403 });
  }

  const { id } = await ctx.params;
  try {
    return NextResponse.json({ summary: getDeletionSummary(session.companyId, id) });
  } catch (e) {
    if (e instanceof OrderDeletionError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
