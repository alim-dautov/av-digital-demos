import { getData, mutateData } from "@/lib/db";
import { canManageAccess, canSeeOthersPayroll } from "@/lib/rbac";
import type { Employee, SessionUser } from "@/types";

export class PayrollScopeError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 = 400,
  ) {
    super(message);
  }
}

/** Все подчинённые (включая подчинённых подчинённых), без самого руководителя. */
export function supervisedEmployeeIds(
  companyId: string,
  supervisorId: string,
  employees: Employee[] = getData().employees,
): Set<string> {
  const inCompany = employees.filter((e) => e.companyId === companyId);
  const result = new Set<string>();
  const queue = [supervisorId];
  while (queue.length > 0) {
    const boss = queue.shift()!;
    for (const e of inCompany) {
      if (e.supervisorId === boss && e.id !== supervisorId && !result.has(e.id)) {
        result.add(e.id);
        queue.push(e.id);
      }
    }
  }
  return result;
}

type ScopeSubject = Pick<SessionUser, "role" | "access" | "companyId" | "employeeId">;

/** null — видит всех; иначе множество сотрудников, чьи зарплаты/авансы можно читать. */
export function payrollReadScope(session: ScopeSubject): Set<string> | null {
  if (canSeeOthersPayroll(session)) return null;
  const ids = new Set<string>();
  if (!session.employeeId) return ids;
  ids.add(session.employeeId);
  for (const id of supervisedEmployeeIds(session.companyId, session.employeeId)) ids.add(id);
  return ids;
}

export function canReadEmployeePayroll(session: ScopeSubject, employeeId: string): boolean {
  const scope = payrollReadScope(session);
  return scope === null || scope.has(employeeId);
}

/** Руководитель и личный % аванса. Меняют только OWNER/DIRECTOR (и ADMIN). */
export function setEmployeePayrollLinks(
  actor: Pick<SessionUser, "role" | "access" | "companyId">,
  employeeId: string,
  patch: { supervisorId?: string | null; advanceMaxPercent?: number | null },
): Employee {
  if (!canManageAccess(actor)) throw new PayrollScopeError("Недостаточно прав", 403);
  if (
    patch.advanceMaxPercent != null &&
    (!Number.isFinite(patch.advanceMaxPercent) ||
      patch.advanceMaxPercent < 0 ||
      patch.advanceMaxPercent > 100)
  ) {
    throw new PayrollScopeError("Процент аванса — от 0 до 100");
  }
  let updated!: Employee;
  mutateData((data) => {
    const emp = data.employees.find((e) => e.id === employeeId && e.companyId === actor.companyId);
    if (!emp) throw new PayrollScopeError("Сотрудник не найден", 404);
    if (patch.supervisorId !== undefined) {
      const sid = patch.supervisorId || null;
      if (sid) {
        if (sid === emp.id) throw new PayrollScopeError("Сотрудник не может быть своим руководителем");
        const boss = data.employees.find((e) => e.id === sid && e.companyId === actor.companyId);
        if (!boss) throw new PayrollScopeError("Руководитель не найден", 404);
        if (supervisedEmployeeIds(actor.companyId, emp.id, data.employees).has(sid)) {
          throw new PayrollScopeError("Нельзя назначить руководителем своего подчинённого");
        }
      }
      emp.supervisorId = sid;
    }
    if (patch.advanceMaxPercent !== undefined) {
      emp.advanceMaxPercent =
        patch.advanceMaxPercent == null ? null : Math.round(patch.advanceMaxPercent * 10) / 10;
    }
    updated = { ...emp };
  });
  return updated;
}

export type TeamMemberPayroll = {
  employeeId: string;
  fullName: string;
  position: string;
  advances: { date: string; amount: number }[];
  salaryPayments: { date: string; amount: number }[];
  salaries: { period: string; netAmount: number; status: "pending" | "paid" }[];
};

/** Только чтение: дата и сумма зарплат и авансов подчинённых руководителя. */
export function getTeamPayroll(companyId: string, supervisorId: string): TeamMemberPayroll[] {
  const data = getData();
  const ids = supervisedEmployeeIds(companyId, supervisorId, data.employees);
  const byDateDesc = (a: { date: string }, b: { date: string }) => (a.date < b.date ? 1 : -1);
  return data.employees
    .filter((e) => ids.has(e.id) && e.status !== "fired")
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"))
    .map((e) => ({
      employeeId: e.id,
      fullName: e.fullName,
      position: e.position,
      advances: data.advances
        .filter((a) => a.companyId === companyId && a.employeeId === e.id)
        .map((a) => ({ date: a.date, amount: a.amount }))
        .sort(byDateDesc),
      salaryPayments: data.salaryPayments
        .filter((p) => p.companyId === companyId && p.employeeId === e.id)
        .map((p) => ({ date: p.date, amount: p.amount }))
        .sort(byDateDesc),
      salaries: data.salaries
        .filter((s) => s.companyId === companyId && s.employeeId === e.id)
        .map((s) => ({ period: s.period, netAmount: s.netAmount, status: s.status }))
        .sort((a, b) => (a.period < b.period ? 1 : -1)),
    }));
}
