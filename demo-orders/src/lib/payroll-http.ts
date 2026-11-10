import { NextResponse } from "next/server";
import { z } from "zod";
import { dateSchema, idSchema, optional, optionalText } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can, canSeeOthersPayroll, type Action } from "@/lib/rbac";
import { PayrollError, type PayrollActor } from "@/lib/services/payroll";
import type { SessionUser } from "@/types";

const amountSchema = z.coerce.number().finite().positive().max(1_000_000_000);

export const paymentMethodSchema = z.enum(["cash", "cashless"]);

export const advanceBodySchema = z.object({
  employeeId: idSchema,
  amount: amountSchema,
  date: dateSchema,
  comment: z.string().trim().min(1).max(1000),
  paymentMethod: paymentMethodSchema,
  orderId: optional(idSchema),
});

export const salaryPaymentBodySchema = z.object({
  employeeId: idSchema,
  amount: amountSchema,
  date: dateSchema,
  comment: optionalText(1000),
});

type Guarded = { session: SessionUser; error?: never } | { session?: never; error: NextResponse };

/** Сессия с правом на модуль зарплат; удаление требует `manage`. */
export async function payrollSession(action: Action): Promise<Guarded> {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "payroll", action)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

/** Без права видеть чужие зарплаты можно работать только со своими записями. */
export function outOfScope(
  session: SessionUser,
  ...employeeIds: (string | null | undefined)[]
): NextResponse | null {
  if (canSeeOthersPayroll(session)) return null;
  const foreign = employeeIds.some((id) => id !== undefined && id !== session.employeeId);
  return foreign ? NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) : null;
}

export function actorOf(session: SessionUser): PayrollActor {
  return { id: session.id, name: session.fullName };
}

export function payrollFailure(e: unknown, fallback: string): NextResponse {
  if (e instanceof PayrollError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof Error && e.message === "База занята, повторите попытку") {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}
