import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { dateSchema, idSchema, optional, optionalText, parseJson, rejectForeignRefs } from "@/lib/api";
import { createPenalty } from "@/lib/services/payroll";

const bodySchema = z.object({
  employeeId: idSchema,
  reason: z.string().trim().min(1).max(500),
  amount: z.coerce.number().finite().positive().max(1_000_000_000),
  comment: optionalText(1000),
  date: optional(dateSchema),
});

export async function POST(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "payroll", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { data, error } = await parseJson(request, bodySchema, "Укажите сотрудника, причину и сумму");
  if (error) return error;

  const foreign = rejectForeignRefs(session.companyId, { employeeIds: [data.employeeId] });
  if (foreign) return foreign;

  try {
    const penalty = createPenalty({
      companyId: session.companyId,
      employeeId: data.employeeId,
      reason: data.reason,
      amount: data.amount,
      comment: data.comment,
      authorId: session.id,
      auto: false,
      date: data.date ?? undefined,
    });
    return NextResponse.json({ penalty }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось создать штраф";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
