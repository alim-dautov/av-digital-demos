import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import { listAdvances, listSalaryPayments, listSalaries } from "@/lib/services/payroll";

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!session.employeeId) return NextResponse.json({ salary: [], payments: [], advances: [], penalties: [] });

  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(params);
  if (!parsed.success || (parsed.data.from && parsed.data.to && parsed.data.from > parsed.data.to)) {
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  }
  const filter = { employeeId: session.employeeId, from: parsed.data.from, to: parsed.data.to };
  const salaryFrom = parsed.data.from?.slice(0, 7);
  const salaryTo = parsed.data.to?.slice(0, 7);
  const salary = listSalaries(session.companyId).filter((row) => (!salaryFrom || row.period >= salaryFrom) && (!salaryTo || row.period <= salaryTo) && row.employeeId === session.employeeId);
  const payments = listSalaryPayments(session.companyId, filter);
  const advances = listAdvances(session.companyId, filter);
  const penalties = getData().penalties.filter((row) => row.companyId === session.companyId && row.employeeId === session.employeeId && (!parsed.data.from || row.date.slice(0, 10) >= parsed.data.from) && (!parsed.data.to || row.date.slice(0, 10) <= parsed.data.to));
  return NextResponse.json({ salary, payments, advances, penalties });
}
