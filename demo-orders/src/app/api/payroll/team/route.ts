import { NextResponse } from "next/server";
import { payrollSession } from "@/lib/payroll-http";
import { getTeamPayroll } from "@/lib/services/payroll-scope";

/** Зарплаты и авансы подчинённых текущего пользователя (только чтение). */
export async function GET() {
  const { session, error } = await payrollSession("read");
  if (error) return error;
  if (!session.employeeId) return NextResponse.json({ team: [] });
  return NextResponse.json({ team: getTeamPayroll(session.companyId, session.employeeId) });
}
