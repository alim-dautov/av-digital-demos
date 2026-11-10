import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { idSchema, optional, optionalText, parseJson, rejectForeignRefs } from "@/lib/api";
import { createReport } from "@/lib/services/reports";

const bodySchema = z.object({
  orderId: idSchema,
  whatDone: z.string().trim().min(1).max(4000),
  stageId: optional(idSchema.max(128)),
  problems: optionalText(4000),
  materials: optionalText(4000),
  comment: optionalText(4000),
  unitsDone: z.coerce.number().finite().min(0).max(10_000).catch(0),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "reports", "write")) {
      return NextResponse.json(
        { error: "Создание отчётов доступно мастерам" },
        { status: 403 },
      );
    }
    if (!session.employeeId) {
      return NextResponse.json(
        { error: "К аккаунту не привязан сотрудник" },
        { status: 400 },
      );
    }

    const { data, error } = await parseJson(request, bodySchema, "Укажите заказ и что сделано");
    if (error) return error;

    const foreign = rejectForeignRefs(session.companyId, { orderId: data.orderId });
    if (foreign) return foreign;

    const report = createReport({
      companyId: session.companyId,
      orderId: data.orderId,
      stageId: data.stageId ?? null,
      employeeId: session.employeeId,
      whatDone: data.whatDone,
      problems: data.problems,
      materials: data.materials,
      unitsDone: data.unitsDone,
      comment: data.comment,
    });

    return NextResponse.json({ report }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось создать отчёт" }, { status: 500 });
  }
}
