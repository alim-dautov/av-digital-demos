import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getData } from "@/lib/db";
import { can, canSeeOthersPayroll } from "@/lib/rbac";
import { listEmployees } from "@/lib/services/employees";
import {
  getAdvanceLimit,
  getAssemblerDebt,
  getOwnPayrollSummary,
  listAdvances,
  listPenalties,
  listSalaries,
  listSalaryPayments,
} from "@/lib/services/payroll";
import { getTeamPayroll } from "@/lib/services/payroll-scope";
import { PayrollView } from "./payroll-view";

export default async function PayrollPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  if (!can(session, "payroll", "read")) {
    redirect("/");
  }

  const companyId = session.companyId;
  const seeOthers = canSeeOthersPayroll(session);
  const employeesRaw = listEmployees(companyId, { hidePhone: true });
  const nameById = new Map(employeesRaw.map((e) => [e.id, e.fullName]));
  const userNameById = new Map(getData().users.map((u) => [u.id, u.fullName]));
  const authorName = (id: string) =>
    id === "system" ? "Система" : (userNameById.get(id) ?? "—");
  const employeeName = (id: string) => nameById.get(id) ?? "Сотрудник";

  let salaries = listSalaries(companyId).map((s) => ({
    ...s,
    employeeName: employeeName(s.employeeId),
  }));
  let payments = listSalaryPayments(companyId).map((p) => ({
    ...p,
    employeeName: employeeName(p.employeeId),
    authorName: authorName(p.authorId),
  }));
  let advances = listAdvances(companyId).map((a) => ({
    ...a,
    employeeName: employeeName(a.employeeId),
    authorName: authorName(a.authorId),
  }));
  let penalties = listPenalties(companyId).map((p) => ({
    ...p,
    employeeName: employeeName(p.employeeId),
  }));

  if (!seeOthers) {
    const selfId = session.employeeId;
    if (!selfId) {
      return (
        <div className="py-16 text-center">
          <h1 className="text-xl font-semibold">Нет данных по зарплате</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Аккаунт не привязан к сотруднику.
          </p>
        </div>
      );
    }
    salaries = salaries.filter((s) => s.employeeId === selfId);
    payments = payments.filter((p) => p.employeeId === selfId);
    advances = advances.filter((a) => a.employeeId === selfId);
    penalties = penalties.filter((p) => p.employeeId === selfId);
  }

  const formEmployees = employeesRaw
    .filter((e) => e.status !== "fired" && (seeOthers || e.id === session.employeeId))
    .map((e) => ({
      id: e.id,
      fullName: e.fullName,
      ...getAdvanceLimit(companyId, e.id),
    }));

  const debt = seeOthers
    ? getAssemblerDebt(companyId)
    : { totalDebt: 0, masters: [] };

  return (
    <PayrollView
      salaries={salaries}
      payments={payments}
      advances={advances}
      advanceHistory={seeOthers && can(session, "payroll", "write")
        ? getData().activityLog.filter((entry) => entry.companyId === companyId && entry.entityType === "advance")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : []}
      penalties={penalties}
      employees={formEmployees}
      debt={debt}
      canWrite={can(session, "payroll", "write")}
      canManage={can(session, "payroll", "manage")}
      seeOthers={seeOthers}
      team={
        !seeOthers && session.employeeId
          ? getTeamPayroll(companyId, session.employeeId)
          : []
      }
      own={
        !seeOthers && session.employeeId
          ? getOwnPayrollSummary(companyId, session.employeeId)
          : null
      }
    />
  );
}
