import { NextResponse } from "next/server";
import { parseJson, rejectForeignRefs } from "@/lib/api";
import {
  actorOf,
  outOfScope,
  payrollFailure,
  payrollSession,
  salaryPaymentBodySchema,
} from "@/lib/payroll-http";
import {
  deleteSalaryPayment,
  getSalaryPayment,
  updateSalaryPayment,
} from "@/lib/services/payroll";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const { id } = await ctx.params;
  const { data, error: bad } = await parseJson(
    request,
    salaryPaymentBodySchema,
    "Укажите сотрудника, сумму и дату выплаты",
  );
  if (bad) return bad;
  const denied = outOfScope(
    session,
    data.employeeId,
    getSalaryPayment(session.companyId, id)?.employeeId,
  );
  if (denied) return denied;
  const foreign = rejectForeignRefs(session.companyId, { employeeIds: [data.employeeId] });
  if (foreign) return foreign;
  try {
    const payment = updateSalaryPayment(session.companyId, id, data, actorOf(session));
    return NextResponse.json({ payment });
  } catch (e) {
    return payrollFailure(e, "Не удалось изменить выплату");
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("manage");
  if (error) return error;
  const { id } = await ctx.params;
  const denied = outOfScope(session, getSalaryPayment(session.companyId, id)?.employeeId);
  if (denied) return denied;
  try {
    deleteSalaryPayment(session.companyId, id, actorOf(session));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollFailure(e, "Не удалось удалить выплату");
  }
}
