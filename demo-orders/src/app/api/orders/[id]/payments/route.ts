import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { addOrderPayment } from "@/lib/services/cash";

const schema = z.object({
  amount: z.coerce.number().finite().min(0).optional(),
  prepayment: z.coerce.number().finite().min(0).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  comment: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "orders", "write") && !can(session, "finance", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const order = addOrderPayment(session.companyId, id, {
      amount: parsed.data.amount ?? 0,
      prepayment: parsed.data.prepayment,
      date: parsed.data.date,
      comment: parsed.data.comment,
    });
    return NextResponse.json({ order });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка" },
      { status: 400 },
    );
  }
}
