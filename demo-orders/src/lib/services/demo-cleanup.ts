import fs from "fs";
import { GULYA_EMPLOYEE_ID, GULYA_USER_ID } from "@/lib/db/gulya";
import { dropOrderWorkRecords } from "@/lib/services/order-cascade";
import { uploadPath } from "@/lib/uploads";
import type { AppData } from "@/types";

export const ATELIER_COMPANY_ID = "company_002";

const DEMO_USER_EMAILS = new Set(["admin@example.com", "manager@example.com", "ceh@example.com"]);
const SEED_PREFIX = /^(user|emp|cli|ord)_zp_/;
/** Real staff created with the seed prefix. */
const REAL_IDS = new Set([GULYA_USER_ID, GULYA_EMPLOYEE_ID]);
const SEED_ID = { test: (id: string) => SEED_PREFIX.test(id) && !REAL_IDS.has(id) };
const TEST_NAME = /(^|[^а-яёa-z])(тест\S*|test\S*|демо|demo|e2e)([^а-яёa-z]|$)/i;

export type DemoDataReport = {
  users: { id: string; label: string }[];
  employees: { id: string; label: string }[];
  clients: { id: string; label: string }[];
  orders: { id: string; label: string }[];
  proposals: number;
  measurements: number;
  tasks: number;
  notifications: number;
  activity: number;
  other: number;
};

type Selection = {
  userIds: Set<string>;
  employeeIds: Set<string>;
  clientIds: Set<string>;
  orderIds: Set<string>;
  orderNumbers: Set<string>;
};

export function isTestName(value: string | null | undefined): boolean {
  return Boolean(value && TEST_NAME.test(value));
}

export type DemoScope = {
  /** Also match clients and orders whose names look like tests («тест», «demo», «e2e»). */
  byName: boolean;
};

const FULL_SCOPE: DemoScope = { byName: true };

function select(data: AppData, companyId: string, scope: DemoScope): Selection {
  const users = data.users.filter(
    (u) => u.companyId === companyId && (SEED_ID.test(u.id) || DEMO_USER_EMAILS.has(u.email)),
  );
  const userIds = new Set(users.map((u) => u.id));
  const employeeIds = new Set(
    data.employees
      .filter(
        (e) =>
          e.companyId === companyId &&
          (SEED_ID.test(e.id) || users.some((u) => u.employeeId === e.id)),
      )
      .map((e) => e.id),
  );
  const clientIds = new Set(
    data.clients
      .filter((c) => c.companyId === companyId && (SEED_ID.test(c.id) || (scope.byName && isTestName(c.fullName))))
      .map((c) => c.id),
  );
  const orders = data.orders.filter(
    (o) =>
      o.companyId === companyId &&
      (SEED_ID.test(o.id) ||
        clientIds.has(o.clientId) ||
        (scope.byName &&
          (isTestName(o.description) || isTestName(o.atelierQuote?.clientName)))),
  );
  return {
    userIds,
    employeeIds,
    clientIds,
    orderIds: new Set(orders.map((o) => o.id)),
    orderNumbers: new Set(orders.map((o) => o.number)),
  };
}

function refsSelected(s: Selection, refs: { orderId?: string | null; clientId?: string | null }) {
  return (
    (refs.orderId != null && (s.orderIds.has(refs.orderId) || s.orderNumbers.has(refs.orderId))) ||
    (refs.clientId != null && s.clientIds.has(refs.clientId))
  );
}

function hrefSelected(s: Selection, href: string | null) {
  if (!href) return false;
  const tail = href.split("/").pop() ?? "";
  return s.orderIds.has(tail) || s.orderNumbers.has(tail) || s.clientIds.has(tail);
}

/** Demo and test records of a company, without touching catalogs and settings. */
export function findDemoData(
  data: AppData,
  companyId = ATELIER_COMPANY_ID,
  scope: DemoScope = FULL_SCOPE,
): DemoDataReport {
  const s = select(data, companyId, scope);
  const inCompany = <T extends { companyId: string }>(rows: T[]) =>
    rows.filter((r) => r.companyId === companyId);
  const label = (id: string, text: string) => ({ id, label: text });

  return {
    users: data.users
      .filter((u) => s.userIds.has(u.id))
      .map((u) => label(u.id, `${u.fullName} (${u.email || u.login})`)),
    employees: data.employees
      .filter((e) => s.employeeIds.has(e.id))
      .map((e) => label(e.id, e.fullName)),
    clients: data.clients.filter((c) => s.clientIds.has(c.id)).map((c) => label(c.id, c.fullName)),
    orders: data.orders
      .filter((o) => s.orderIds.has(o.id))
      .map((o) => label(o.id, `${o.number} · ${o.description}`)),
    proposals: inCompany(data.commercialProposals).filter(
      (p) => refsSelected(s, p) || refsSelected(s, { orderId: p.calculatorId }),
    ).length,
    measurements:
      inCompany(data.measurements).filter((m) => refsSelected(s, m)).length +
      inCompany(data.clientMeasurements).filter((m) => refsSelected(s, m)).length,
    tasks: inCompany(data.tasks).filter(
      (t) => refsSelected(s, t) || (t.assigneeId != null && s.employeeIds.has(t.assigneeId)),
    ).length,
    notifications: inCompany(data.notifications).filter(
      (n) => (n.userId != null && s.userIds.has(n.userId)) || hrefSelected(s, n.href),
    ).length,
    activity: inCompany(data.activityLog).filter(
      (a) =>
        s.userIds.has(a.actorId) ||
        (a.entityId != null &&
          (s.orderIds.has(a.entityId) || s.clientIds.has(a.entityId))),
    ).length,
    other:
      inCompany(data.galleryPhotos).filter((p) => refsSelected(s, p)).length +
      inCompany(data.orderExpenses).filter((e) => refsSelected(s, e)).length +
      inCompany(data.pushSubscriptions).filter((p) => s.userIds.has(p.userId)).length,
  };
}

export function demoReportIsEmpty(r: DemoDataReport): boolean {
  return (
    r.users.length +
      r.employees.length +
      r.clients.length +
      r.orders.length +
      r.proposals +
      r.measurements +
      r.tasks +
      r.notifications +
      r.activity +
      r.other ===
    0
  );
}

/**
 * Removes demo and test records with everything that points at them.
 * Returns upload directories to delete after the data is saved.
 */
export function purgeDemoData(
  data: AppData,
  companyId = ATELIER_COMPANY_ID,
  scope: DemoScope = FULL_SCOPE,
): { report: DemoDataReport; uploadDirs: string[] } {
  const report = findDemoData(data, companyId, scope);
  const s = select(data, companyId, scope);
  const other = (row: { companyId: string }) => row.companyId !== companyId;

  const proposalIds = new Set(
    data.commercialProposals
      .filter(
        (p) =>
          !other(p) && (refsSelected(s, p) || refsSelected(s, { orderId: p.calculatorId })),
      )
      .map((p) => p.id),
  );
  const measurementIds = new Set(
    data.clientMeasurements.filter((m) => !other(m) && refsSelected(s, m)).map((m) => m.id),
  );

  data.users = data.users.filter((u) => !s.userIds.has(u.id));
  data.employees = data.employees.filter((e) => !s.employeeIds.has(e.id));
  data.clients = data.clients.filter((c) => !s.clientIds.has(c.id));
  data.orders = data.orders.filter((o) => !s.orderIds.has(o.id));
  data.commercialProposals = data.commercialProposals.filter((p) => !proposalIds.has(p.id));
  data.clientMeasurements = data.clientMeasurements.filter((m) => !measurementIds.has(m.id));
  data.measurements = data.measurements.filter(
    (m) => other(m) || (!refsSelected(s, m) && !s.employeeIds.has(m.measurerId)),
  );
  dropOrderWorkRecords(data, companyId, { ids: s.orderIds, numbers: s.orderNumbers });
  data.reports = data.reports.filter((x) => other(x) || !s.employeeIds.has(x.employeeId));
  data.inventoryMovements = data.inventoryMovements.filter(
    (x) => other(x) || x.orderId == null || !s.orderIds.has(x.orderId),
  );
  data.tasks = data.tasks.filter(
    (t) =>
      other(t) ||
      (!refsSelected(s, t) && !(t.assigneeId != null && s.employeeIds.has(t.assigneeId))),
  );
  data.notifications = data.notifications.filter(
    (n) =>
      other(n) || (!(n.userId != null && s.userIds.has(n.userId)) && !hrefSelected(s, n.href)),
  );
  data.activityLog = data.activityLog.filter(
    (a) =>
      other(a) ||
      (!s.userIds.has(a.actorId) &&
        !(a.entityId != null && (s.orderIds.has(a.entityId) || s.clientIds.has(a.entityId))) &&
        !(a.entityId != null && proposalIds.has(a.entityId))),
  );
  data.galleryPhotos = data.galleryPhotos.filter((p) => other(p) || !refsSelected(s, p));
  data.orderExpenses = data.orderExpenses.filter((e) => other(e) || !s.orderIds.has(e.orderId));
  data.pushSubscriptions = data.pushSubscriptions.filter((p) => !s.userIds.has(p.userId));
  data.salaries = data.salaries.filter((x) => other(x) || !s.employeeIds.has(x.employeeId));
  data.salaryPayments = (data.salaryPayments ?? []).filter(
    (x) => other(x) || !s.employeeIds.has(x.employeeId),
  );
  const removedAdvances = data.advances.filter(
    (x) => !other(x) && s.employeeIds.has(x.employeeId),
  );
  data.advances = data.advances.filter((x) => other(x) || !s.employeeIds.has(x.employeeId));
  data.penalties = data.penalties.filter((x) => other(x) || !s.employeeIds.has(x.employeeId));
  data.attendance = data.attendance.filter((x) => other(x) || !s.employeeIds.has(x.employeeId));

  const uploadDirs = [
    ...[...s.orderIds].map((id) => uploadPath(companyId, "order", id)),
    ...[...s.clientIds].map((id) => uploadPath(companyId, "client", id)),
    ...[...measurementIds].map((id) => uploadPath(companyId, "measurement", id)),
    ...removedAdvances.map((a) => uploadPath(companyId, "advance", a.id)),
  ];
  return { report, uploadDirs };
}

export function removeUploadDirs(dirs: string[]): void {
  for (const dir of dirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a missing or locked folder does not block the cleanup */
    }
  }
}
