import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { sendToWorkshop, WorkshopError } from "@/lib/services/workshop";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "calculator", "write") && !can(session, "orders", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  const { id } = await ctx.params;
  const parsed = z
    .object({
      roomIds: z.array(z.string().trim().min(1).max(64)).min(1).max(200).optional(),
    })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  try {
    const sent = await sendToWorkshop(
      session.companyId,
      id,
      { id: session.id, name: session.fullName },
      parsed.data.roomIds,
    );
    return NextResponse.json(sent);
  } catch (error) {
    if (error instanceof WorkshopError) {
      return NextResponse.json({ error: error.message, order: error.order }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
