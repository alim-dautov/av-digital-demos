import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listEmployees } from "@/lib/services/employees";
import { listOrders } from "@/lib/services/orders";
import { listReports } from "@/lib/services/reports";
import { getData } from "@/lib/db";
import { ReportsView } from "./reports-view";

const SEE_ALL_ROLES = new Set(["OWNER", "DIRECTOR", "MANAGER", "ADMIN"]);

export default async function ReportsPage() {
  const session = await requirePageAccess("reports");

  const seeAll = SEE_ALL_ROLES.has(session.role);
  const canCreate = can(session, "reports", "write");

  const companyId = session.companyId;
  const allReports = listReports(companyId);
  const reports = seeAll
    ? allReports
    : allReports.filter((r) => r.employeeId === session.employeeId);

  const employees = listEmployees(companyId, { hidePhone: true });
  const empMap = new Map(employees.map((e) => [e.id, e.fullName]));
  const orders = listOrders(companyId);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const stages = getData().orderStages.filter((s) => s.companyId === companyId);
  const stageMap = new Map(stages.map((s) => [s.id, s]));

  const reportRows = reports.map((r) => {
    const stage = r.stageId ? stageMap.get(r.stageId) : null;
    return {
      id: r.id,
      orderId: r.orderId,
      orderNumber: orderMap.get(r.orderId)?.number ?? r.orderId,
      stageId: r.stageId,
      stageLabel: stage?.label ?? null,
      employeeId: r.employeeId,
      employeeName: empMap.get(r.employeeId) ?? "Сотрудник",
      whatDone: r.whatDone,
      problems: r.problems,
      materials: r.materials,
      unitsDone: r.unitsDone,
      comment: r.comment,
      createdAt: r.createdAt,
    };
  });

  const orderOptions = orders.map((o) => ({
    id: o.id,
    number: o.number,
    description: o.description,
    stages: stages
      .filter((s) => s.orderId === o.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s) => ({ id: s.id, label: s.label, key: s.key })),
  }));

  return (
    <ReportsView
      reports={reportRows}
      orders={orderOptions}
      canCreate={canCreate}
      seeAll={seeAll}
    />
  );
}
