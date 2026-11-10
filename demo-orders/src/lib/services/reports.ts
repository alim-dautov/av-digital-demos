import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import { createNotification } from "@/lib/services/notifications";
import type { EmployeeReport, MediaItem } from "@/types";

export function listReports(
  companyId: string,
  opts?: { employeeId?: string; orderId?: string },
): EmployeeReport[] {
  let reports = getData().reports.filter((r) => r.companyId === companyId);
  if (opts?.employeeId) {
    reports = reports.filter((r) => r.employeeId === opts.employeeId);
  }
  if (opts?.orderId) {
    reports = reports.filter((r) => r.orderId === opts.orderId);
  }
  return reports.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getReportsForOrder(
  companyId: string,
  orderId: string,
): EmployeeReport[] {
  return listReports(companyId, { orderId });
}

export function createReport(input: {
  companyId: string;
  orderId: string;
  stageId?: string | null;
  employeeId: string;
  whatDone: string;
  problems?: string | null;
  materials?: string | null;
  unitsDone?: number;
  comment?: string | null;
  media?: MediaItem[];
}): EmployeeReport {
  const report: EmployeeReport = {
    id: generateId("rep"),
    companyId: input.companyId,
    orderId: input.orderId,
    stageId: input.stageId ?? null,
    employeeId: input.employeeId,
    whatDone: input.whatDone,
    problems: input.problems ?? null,
    materials: input.materials ?? null,
    unitsDone: input.unitsDone ?? 0,
    comment: input.comment ?? null,
    media: input.media ?? [],
    createdAt: nowIso(),
  };

  mutateData((data) => {
    data.reports.unshift(report);
  });

  const data = getData();
  const emp = data.employees.find((e) => e.id === input.employeeId);
  const order = data.orders.find((o) => o.id === input.orderId);

  for (const u of data.users.filter(
    (x) =>
      x.companyId === input.companyId &&
      x.isActive &&
      (x.role === "OWNER" || x.role === "DIRECTOR" || x.role === "MANAGER"),
  )) {
    void createNotification({
      companyId: input.companyId,
      userId: u.id,
      type: "new_report",
      title: `Отчёт ${emp?.firstName ?? "сотрудника"}`,
      body: order
        ? `${report.whatDone.slice(0, 80)} (заказ ${order.number})`
        : report.whatDone.slice(0, 100),
      href: order ? `/orders/${order.number}` : "/reports",
    });
  }

  return report;
}
