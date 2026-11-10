import { NextResponse } from "next/server";
import { parseJson, rejectForeignRefs } from "@/lib/api";
import {
  actorOf,
  outOfScope,
  payrollFailure,
  payrollSession,
  salaryPaymentBodySchema,
} from "@/lib/payroll-http";
import { canSeeOthersPayroll } from "@/lib/rbac";
import { canReadEmployeePayroll } from "@/lib/services/payroll-scope";
import { createSalaryPayment, listSalaryPayments, sumAmounts } from "@/lib/services/payroll";

export async function GET(request: Request) {
  const { session, error } = await payrollSession("read");
  if (error) return error;
  const q = new URL(request.url).searchParams;
  const requested = q.get("employeeId");
  // Руководитель может читать выплаты своих подчинённых.
  const employeeId = canSeeOthersPayroll(session)
    ? requested
    : requested && canReadEmployeePayroll(session, requested)
      ? requested
      : session.employeeId;
  if (!employeeId && !canSeeOthersPayroll(session)) {
    return NextResponse.json({ payments: [], total: 0 });
  }
  const payments = listSalaryPayments(session.companyId, {
    employeeId,
    from: q.get("from"),
    to: q.get("to"),
  });
  return NextResponse.json({ payments, total: sumAmounts(payments) });
}

export async function POST(request: Request) {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const { data, error: bad } = await parseJson(
    request,
    salaryPaymentBodySchema,
    "Укажите сотрудника, сумму и дату выплаты",
  );
  if (bad) return bad;
  const denied = outOfScope(session, data.employeeId);
  if (denied) return denied;
  const foreign = rejectForeignRefs(session.companyId, { employeeIds: [data.employeeId] });
  if (foreign) return foreign;
  try {
    const payment = createSalaryPayment(session.companyId, data, actorOf(session));
    return NextResponse.json({ payment }, { status: 201 });
  } catch (e) {
    return payrollFailure(e, "Не удалось сохранить выплату");
  }
}
