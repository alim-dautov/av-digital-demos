import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { moveOrderToProductionColumn } from "@/lib/services/production";

const bodySchema = z.object({
  orderId: z.string().min(1),
  columnKey: z.string().min(1),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "production", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  try {
    const result = moveOrderToProductionColumn(
      session.companyId,
      parsed.data.orderId,
      parsed.data.columnKey,
      { id: session.id, name: session.fullName },
    );
    if (!result) {
      return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      orderId: result.order.id,
      columnKey: parsed.data.columnKey,
      stage: {
        id: result.stage.id,
        key: result.stage.key,
        label: result.stage.label,
        status: result.stage.status,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка перемещения";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
