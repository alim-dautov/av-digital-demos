import { getData } from "@/lib/db";
import type {
  Advance,
  Attendance,
  Employee,
  Order,
  Penalty,
  SalaryPayment,
  Task,
} from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type EmployeeListItem = Omit<Employee, "phone"> & {
  phone?: never;
};

export type EmployeeDetail = Employee & {
  tasks: Task[];
  orders: Order[];
  advances: Advance[];
  salaryPayments: SalaryPayment[];
  penalties: Penalty[];
  attendance: Attendance[];
};

export function listEmployees(
  companyId: string,
  opts?: { hidePhone?: boolean },
): Array<Employee | EmployeeListItem> {
  const employees = getData()
    .employees.filter((e) => e.companyId === companyId)
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));

  if (opts?.hidePhone !== false) {
    return employees.map(({ phone: _phone, ...rest }) => rest);
  }
  return employees;
}

export function getEmployee(
  companyId: string,
  id: string,
): EmployeeDetail | null {
  const data = getData();
  const employee = data.employees.find(
    (e) => e.companyId === companyId && e.id === id,
  );
  if (!employee) return null;

  return {
    ...employee,
    tasks: data.tasks.filter(
      (t) => t.companyId === companyId && t.assigneeId === id,
    ),
    orders: data.orders.filter(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.masterId === id || o.masterIds?.includes(id) || o.responsibleId === id),
    ),
    advances: data.advances
      .filter((a) => a.companyId === companyId && a.employeeId === id)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    salaryPayments: data.salaryPayments
      .filter((p) => p.companyId === companyId && p.employeeId === id)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
    penalties: data.penalties.filter(
      (p) => p.companyId === companyId && p.employeeId === id,
    ),
    attendance: data.attendance
      .filter((a) => a.companyId === companyId && a.employeeId === id)
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  };
}

export type MasterWorkload = {
  employee: EmployeeListItem;
  activeOrders: number;
  totalUnits: number;
  overdueOrders: number;
  stagesInProgress: number;
  loadPercent: number;
  avgDeadlineDays: number | null;
  currentStages: string[];
};

export function getMastersWorkload(companyId: string): MasterWorkload[] {
  const data = getData();
  const masters = data.employees.filter(
    (e) =>
      e.companyId === companyId &&
      e.role === "MASTER" &&
      e.status === "active",
  );

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  return masters.map((master) => {
    const { phone: _p, ...safe } = master;
    const orders = data.orders.filter(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.masterId === master.id || o.masterIds?.includes(master.id)) &&
        o.status !== "closed" &&
        o.status !== "lead",
    );
    const stages = data.orderStages.filter(
      (s) =>
        s.companyId === companyId &&
        s.responsibleId === master.id &&
        s.status === "in_progress",
    );
    const activeOrders = orders.length;
    const totalUnits = orders.reduce((s, o) => s + (o.furnitureUnits || 0), 0);
    const overdueOrders = orders.filter((o) => o.deadline < todayStr).length;
    const loadPercent = Math.min(100, activeOrders * 25 + stages.length * 10);

    let avgDeadlineDays: number | null = null;
    if (orders.length) {
      const days = orders.map((o) => {
        const d = (new Date(o.deadline).getTime() - today.getTime()) / 86400000;
        return d;
      });
      avgDeadlineDays = Math.round(
        days.reduce((a, b) => a + b, 0) / days.length,
      );
    }

    return {
      employee: safe,
      activeOrders,
      totalUnits,
      overdueOrders,
      stagesInProgress: stages.length,
      loadPercent,
      avgDeadlineDays,
      currentStages: stages.map((s) => s.label),
    };
  });
}
