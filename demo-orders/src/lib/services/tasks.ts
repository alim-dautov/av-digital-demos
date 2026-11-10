import { getData, mutateData } from "@/lib/db";
import { generateId, nowIso, todayDate } from "@/lib/utils";
import { getTaskBoardStatus } from "@/lib/task-board";
import type { Task, TaskPriority, TaskStatus } from "@/types";

export function listTasks(
  companyId: string,
  opts?: {
    status?: TaskStatus;
    assigneeId?: string;
    orderId?: string;
    search?: string;
  },
): Task[] {
  let tasks = getData().tasks.filter((t) => t.companyId === companyId);
  if (opts?.status) tasks = tasks.filter((t) => t.status === opts.status);
  if (opts?.assigneeId) {
    tasks = tasks.filter((t) => t.assigneeId === opts.assigneeId);
  }
  if (opts?.orderId) tasks = tasks.filter((t) => t.orderId === opts.orderId);
  if (opts?.search?.trim()) {
    const q = opts.search.trim().toLowerCase();
    tasks = tasks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q),
    );
  }
  return tasks.sort((a, b) => {
    if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function getTodayTasks(
  companyId: string,
  userEmployeeId?: string | null,
): Task[] {
  const today = todayDate();
  return listTasks(companyId, {
    assigneeId: userEmployeeId ?? undefined,
  }).filter(
    (t) =>
      t.deadline === today &&
      t.status !== "done" &&
      (!userEmployeeId || t.assigneeId === userEmployeeId),
  );
}

export function createTask(input: {
  companyId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  orderId?: string | null;
  stageId?: string | null;
  deadline: string;
  priority?: TaskPriority;
  system?: boolean;
}): Task {
  const task: Task = {
    id: generateId("task"),
    companyId: input.companyId,
    title: input.title,
    description: input.description ?? "",
    assigneeId: input.assigneeId ?? null,
    orderId: input.orderId ?? null,
    stageId: input.stageId ?? null,
    deadline: input.deadline,
    priority: input.priority ?? "medium",
    status: "todo",
    system: input.system ?? false,
    createdAt: nowIso(),
  };
  mutateData((data) => {
    data.tasks.push(task);
  });
  return task;
}

export function updateTaskStatus(
  companyId: string,
  taskId: string,
  status: TaskStatus,
): Task | null {
  let updated: Task | null = null;
  mutateData((data) => {
    const task = data.tasks.find(
      (t) => t.id === taskId && t.companyId === companyId,
    );
    if (!task) return;
    task.status = status;
    updated = { ...task };
  });
  return updated;
}

export { getTaskBoardStatus };

/** System tasks created when an order is placed. */
export function createSystemTasksForOrder(orderId: string): Task[] {
  const data = getData();
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return [];

  const created: Task[] = [];
  const deadline = order.deadline || todayDate();

  const prepare = createTask({
    companyId: order.companyId,
    title: `Подготовить материалы — заказ ${order.number}`,
    description:
      order.materialsNote ??
      "Подготовить материалы и фурнитуру по спецификации заказа",
    assigneeId: order.masterId ?? order.responsibleId,
    orderId: order.id,
    deadline,
    priority: "high",
    system: true,
  });
  created.push(prepare);

  if (order.masterId) {
    created.push(
      createTask({
        companyId: order.companyId,
        title: `Проверить комплектность перед монтажом — заказ ${order.number}`,
        description: "Убедиться, что все модули, фурнитура и крепёж на месте",
        assigneeId: order.masterId,
        orderId: order.id,
        deadline,
        priority: "medium",
        system: true,
      }),
    );
  }

  return created;
}
