import { getData } from "@/lib/db";
import type { Client, Employee, Material, Order, Task } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export type GlobalSearchResult = {
  orders: Order[];
  clients: Client[];
  employees: Omit<Employee, "phone">[];
  materials: Material[];
  tasks: Task[];
};

export function globalSearch(
  companyId: string,
  query: string,
): GlobalSearchResult {
  const q = query.trim().toLowerCase();
  const empty: GlobalSearchResult = {
    orders: [],
    clients: [],
    employees: [],
    materials: [],
    tasks: [],
  };
  if (!q) return empty;

  const data = getData();

  const orders = data.orders
    .filter(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.number.toLowerCase().includes(q) ||
          o.description.toLowerCase().includes(q) ||
          (o.comment?.toLowerCase().includes(q) ?? false)),
    )
    .slice(0, 10);

  const clients = data.clients
    .filter(
      (c) =>
        c.companyId === companyId &&
        (c.fullName.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false)),
    )
    .slice(0, 10);

  const employees = data.employees
    .filter(
      (e) =>
        e.companyId === companyId &&
        (e.fullName.toLowerCase().includes(q) ||
          e.position.toLowerCase().includes(q) ||
          e.firstName.toLowerCase().includes(q)),
    )
    .slice(0, 10)
    .map(({ phone: _p, ...rest }) => rest);

  const materials = data.materials
    .filter(
      (m) =>
        !m.deletedAt && m.companyId === companyId &&
        (m.name.toLowerCase().includes(q) ||
          m.sku.toLowerCase().includes(q)),
    )
    .slice(0, 10);

  const tasks = data.tasks
    .filter(
      (t) =>
        t.companyId === companyId &&
        (t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)),
    )
    .slice(0, 10);

  return { orders, clients, employees, materials, tasks };
}
