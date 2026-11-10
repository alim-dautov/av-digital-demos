import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { dateSchema, idSchema, optional, optionalText, parseJson, rejectForeignRefs } from "@/lib/api";
import { createMovement } from "@/lib/services/inventory";

const bodySchema = z.object({
  materialId: idSchema,
  type: z.enum(["in", "out", "transfer", "adjustment"]),
  quantity: z.coerce
    .number()
    .finite()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0),
  comment: optionalText(1000),
  orderId: optional(idSchema),
  date: optional(dateSchema),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "inventory", "write")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { data, error } = await parseJson(request, bodySchema, "Укажите материал, тип и количество");
    if (error) return error;

    const foreign = rejectForeignRefs(session.companyId, { orderId: data.orderId });
    if (foreign) return foreign;

    const movement = createMovement({
      companyId: session.companyId,
      materialId: data.materialId,
      type: data.type,
      quantity: data.quantity,
      date: data.date ?? undefined,
      responsibleId: session.employeeId,
      orderId: data.orderId ?? null,
      comment: data.comment,
    });

    return NextResponse.json({ movement }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Не удалось создать движение";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
