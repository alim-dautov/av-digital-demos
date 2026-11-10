import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { parseJson } from "@/lib/api";
import { canManageAccess } from "@/lib/rbac";
import { PayrollScopeError, setEmployeePayrollLinks } from "@/lib/services/payroll-scope";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    supervisorId: z.string().trim().max(64).nullable(),
    advanceMaxPercent: z.coerce.number().finite().min(0).max(100).nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

/** Руководитель и личный % аванса сотрудника. Только OWNER/DIRECTOR. */
export async function PATCH(request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canManageAccess(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { data: body, error } = await parseJson(request, patchSchema, "Некорректные данные");
  if (error) return error;
  const { id } = await ctx.params;
  try {
    const e = setEmployeePayrollLinks(session, id, body);
    return NextResponse.json({
      employee: { id: e.id, supervisorId: e.supervisorId ?? null, advanceMaxPercent: e.advanceMaxPercent ?? null },
    });
  } catch (e) {
    if (e instanceof PayrollScopeError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
