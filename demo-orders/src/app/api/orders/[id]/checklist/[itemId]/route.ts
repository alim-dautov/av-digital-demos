import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { toggleChecklistItem } from "@/lib/services/orders";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "checklists", "write") && !can(session, "orders", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id, itemId } = await ctx.params;
  const body = (await request.json().catch(() => null)) as { done?: unknown } | null;
  const done = typeof body?.done === "boolean" ? body.done : undefined;

  const item = toggleChecklistItem(
    session.companyId,
    id,
    itemId,
    { id: session.id, name: session.fullName },
    done,
  );

  if (!item) {
    return NextResponse.json({ error: "Пункт не найден" }, { status: 404 });
  }

  return NextResponse.json({ item });
}
