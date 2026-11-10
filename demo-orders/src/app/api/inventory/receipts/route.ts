import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { createReceipt } from "@/lib/services/inventory";

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  comment: z.string().max(500).nullable().optional(),
  lines: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantity: z.number().positive(),
        unitCost: z.number().min(0),
        attributes: z.record(z.string().max(40), z.string().max(120)).optional(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "inventory", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте позиции: количество и цена обязательны" }, { status: 400 });
  }
  try {
    const result = createReceipt({
      companyId: session.companyId,
      lines: parsed.data.lines,
      date: parsed.data.date,
      comment: parsed.data.comment ?? null,
      responsibleId: session.employeeId,
    });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось оформить приход" },
      { status: 400 },
    );
  }
}
