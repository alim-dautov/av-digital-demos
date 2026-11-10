import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listEmployees } from "@/lib/services/employees";
import { listOrders } from "@/lib/services/orders";
import { getTodayTasks, listTasks } from "@/lib/services/tasks";
import { todayDate } from "@/lib/utils";
import { TasksView } from "./tasks-view";

export default async function TasksPage() {
  const session = await requirePageAccess("tasks");

  const tasks = listTasks(session.companyId);
  const today = todayDate();
  const todayTasks = getTodayTasks(session.companyId);
  const todayIds = [
    ...new Set([
      ...todayTasks.map((t) => t.id),
      ...tasks.filter((t) => t.deadline === today).map((t) => t.id),
    ]),
  ];
  const employees = listEmployees(session.companyId, { hidePhone: true }).map(
    (e) => ({ id: e.id, fullName: e.fullName }),
  );
  const orders = listOrders(session.companyId).map((o) => ({
    id: o.id,
    number: o.number,
    description: o.description,
  }));
  const orderNumbers = Object.fromEntries(
    orders.map((o) => [o.id, o.number]),
  );

  return (
    <TasksView
      key={tasks.map((task) => `${task.id}:${task.status}`).join("|")}
      tasks={tasks}
      todayIds={todayIds}
      employees={employees}
      orders={orders}
      orderNumbers={orderNumbers}
      canWrite={can(session, "tasks", "write")}
    />
  );
}
