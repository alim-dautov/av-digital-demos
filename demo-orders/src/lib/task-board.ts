import type { Task, TaskStatus } from "@/types";

/** Status used by the board. A past deadline always wins until the task is done. */
export function getTaskBoardStatus(
  task: Task,
  today: string,
): TaskStatus {
  if (task.status === "done") return "done";
  if (task.status === "overdue" || task.deadline < today) return "overdue";
  return task.status;
}
