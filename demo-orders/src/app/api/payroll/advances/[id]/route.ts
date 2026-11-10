import { NextResponse } from "next/server";
import { parseJson, rejectForeignRefs } from "@/lib/api";
import {
  actorOf,
  advanceBodySchema,
  outOfScope,
  payrollFailure,
  payrollSession,
} from "@/lib/payroll-http";
import { deleteAdvance, getAdvance, updateAdvance } from "@/lib/services/payroll";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const { id } = await ctx.params;
  const { data, error: bad } = await parseJson(
    request,
    advanceBodySchema,
    "Укажите сотрудника, сумму, дату, назначение и способ выдачи",
  );
  if (bad) return bad;
  const denied = outOfScope(
    session,
    data.employeeId,
    getAdvance(session.companyId, id)?.employeeId,
  );
  if (denied) return denied;
  const foreign = rejectForeignRefs(session.companyId, {
    orderId: data.orderId,
    employeeIds: [data.employeeId],
  });
  if (foreign) return foreign;
  try {
    const advance = updateAdvance(session.companyId, id, data, actorOf(session));
    return NextResponse.json({ advance });
  } catch (e) {
    return payrollFailure(e, "Не удалось изменить аванс");
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("manage");
  if (error) return error;
  const { id } = await ctx.params;
  const denied = outOfScope(session, getAdvance(session.companyId, id)?.employeeId);
  if (denied) return denied;
  try {
    deleteAdvance(session.companyId, id, actorOf(session));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollFailure(e, "Не удалось удалить аванс");
  }
}
