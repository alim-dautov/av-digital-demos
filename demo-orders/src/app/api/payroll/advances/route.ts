import { NextResponse } from "next/server";
import { parseJson, rejectForeignRefs } from "@/lib/api";
import {
  actorOf,
  advanceBodySchema,
  outOfScope,
  payrollFailure,
  payrollSession,
} from "@/lib/payroll-http";
import { canSeeOthersPayroll } from "@/lib/rbac";
import { listEmployees } from "@/lib/services/employees";
import { createAdvance, getAdvanceLimit } from "@/lib/services/payroll";

/** Сотрудники для формы выдачи аванса с текущим лимитом. */
export async function GET() {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const seeOthers = canSeeOthersPayroll(session);
  const employees = listEmployees(session.companyId, { hidePhone: true })
    .filter((e) => e.status !== "fired" && (seeOthers || e.id === session.employeeId))
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      ...getAdvanceLimit(session.companyId, e.id),
    }));
  return NextResponse.json({ employees });
}

export async function POST(request: Request) {
  const { session, error } = await payrollSession("write");
  if (error) return error;

  const { data, error: bad } = await parseJson(
    request,
    advanceBodySchema,
    "Укажите сотрудника, сумму, дату, назначение и способ выдачи",
  );
  if (bad) return bad;
  const denied = outOfScope(session, data.employeeId);
  if (denied) return denied;

  const foreign = rejectForeignRefs(session.companyId, {
    orderId: data.orderId,
    employeeIds: [data.employeeId],
  });
  if (foreign) return foreign;

  try {
    const advance = createAdvance(session.companyId, data, actorOf(session));
    return NextResponse.json({ advance }, { status: 201 });
  } catch (e) {
    return payrollFailure(e, "Не удалось выдать аванс");
  }
}
