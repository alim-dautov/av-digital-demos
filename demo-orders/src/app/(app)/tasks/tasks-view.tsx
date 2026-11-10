"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Check, GripVertical, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PRIORITY_LABELS, TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { getTaskBoardStatus } from "@/lib/task-board";
import { cn, formatDateRu, todayDate } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/types";

const BOARD_COLUMNS: { status: TaskStatus; label: string; tone: string }[] = [
  { status: "todo", label: "К выполнению", tone: "bg-muted-foreground/50" },
  { status: "in_progress", label: "В работе", tone: "bg-primary" },
  { status: "done", label: "Готово", tone: "bg-emerald-500" },
  { status: "overdue", label: "Просрочено", tone: "bg-destructive" },
];

const PRIORITY_VARIANT: Record<TaskPriority, "secondary" | "outline" | "warning" | "destructive"> = {
  low: "secondary", medium: "outline", high: "warning", urgent: "destructive",
};

type EmployeeOption = { id: string; fullName: string };
type OrderOption = { id: string; number: string; description: string };
type TasksViewProps = {
  tasks: Task[]; todayIds: string[]; employees: EmployeeOption[]; orders: OrderOption[];
  orderNumbers: Record<string, string>; canWrite: boolean;
};
type TaskCardProps = {
  task: Task; boardStatus: TaskStatus; isToday: boolean; assigneeName: string;
  orderNumber?: string; canWrite: boolean; pending: boolean;
  onStatusChange: (task: Task, status: TaskStatus) => void; overlay?: boolean;
};

function TaskCard({ task, boardStatus, isToday, assigneeName, orderNumber, canWrite, pending, onStatusChange, overlay = false }: TaskCardProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({ id: task.id, disabled: !canWrite || overlay });
  const overdue = boardStatus === "overdue";
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <article ref={setNodeRef} style={style} className={cn(
      "rounded-lg border bg-panel p-3 shadow-sm transition-shadow",
      overdue ? "border-destructive/40" : "border-border",
      isToday && boardStatus !== "done" && !overdue && "border-primary/50 bg-primary/5",
      isDragging && "opacity-30", overlay && "rotate-1 shadow-xl",
    )}>
      <div className="flex items-start gap-2">
        {canWrite && !overlay && <button type="button" aria-label={`Переместить задачу «${task.title}»`} className="hidden shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-foreground/5 active:cursor-grabbing md:inline-flex" {...attributes} {...listeners}><GripVertical className="size-4" /></button>}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 font-medium leading-snug">{task.title}</p>
            {canWrite && !overlay && <DropdownMenu>
              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="size-8 md:hidden" disabled={pending}><MoreHorizontal className="size-4" /><span className="sr-only">Изменить статус</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end"><DropdownMenuLabel>Переместить в</DropdownMenuLabel>
                {BOARD_COLUMNS.filter((column) => column.status !== "overdue").map((column) => <DropdownMenuItem key={column.status} disabled={boardStatus === column.status || pending} onSelect={() => onStatusChange(task, column.status)}>{column.label}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {isToday && boardStatus !== "done" && <Badge variant="default">Сегодня</Badge>}
            {overdue && <Badge variant="destructive">Просрочено</Badge>}
            <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
          </div>
        </div>
      </div>
      {task.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{task.description}</p>}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={cn("tabular-nums", overdue && "text-destructive")}>до {formatDateRu(task.deadline)}</span><span>{assigneeName}</span>
        {task.orderId && orderNumber && <Link href={`/orders/${orderNumber}`} className="text-primary hover:underline">Заказ №{orderNumber}</Link>}
      </div>
    </article>
  );
}

function KanbanColumn({ status, label, tone, tasks, getProps }: {
  status: TaskStatus; label: string; tone: string; tasks: Task[];
  getProps: (task: Task, status: TaskStatus) => Omit<TaskCardProps, "task" | "boardStatus">;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `column:${status}`, disabled: status === "overdue" });
  return <section ref={setNodeRef} className={cn("flex w-[min(84vw,320px)] shrink-0 flex-col rounded-xl border bg-muted/25 p-3 sm:w-72", isOver && status !== "overdue" && "border-primary bg-primary/5")} aria-label={`${label}: ${tasks.length}`}>
    <div className="mb-3 flex items-center justify-between gap-2 px-1"><h2 className="flex items-center gap-2 text-sm font-semibold"><span className={cn("size-2 rounded-full", tone)} aria-hidden />{label}</h2><span className="text-sm tabular-nums text-muted-foreground">{tasks.length}</span></div>
    <div className="min-h-24 space-y-2">{tasks.map((task) => <TaskCard key={task.id} task={task} boardStatus={status} {...getProps(task, status)} />)}{tasks.length === 0 && <p className="px-1 py-4 text-sm text-muted-foreground">Нет задач</p>}</div>
  </section>;
}

export function TasksView({ tasks: initialTasks, todayIds, employees, orders, orderNumbers, canWrite }: TasksViewProps) {
  const router = useRouter();
  const [tasks, setTasks] = React.useState(initialTasks);
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [priority, setPriority] = React.useState<string>("all");
  const [open, setOpen] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const todaySet = React.useMemo(() => new Set(todayIds), [todayIds]);
  const assigneeName = React.useCallback((id: string | null) => employees.find((employee) => employee.id === id)?.fullName ?? "Не назначен", [employees]);
  const today = todayDate();
  const filtered = React.useMemo(() => tasks.filter((task) => (statusFilter === "all" || getTaskBoardStatus(task, today) === statusFilter) && (priority === "all" || task.priority === priority)), [tasks, statusFilter, priority, today]);
  const grouped = React.useMemo(() => Object.fromEntries(BOARD_COLUMNS.map((column) => [column.status, filtered.filter((task) => getTaskBoardStatus(task, today) === column.status)])) as Record<TaskStatus, Task[]>, [filtered, today]);

  async function changeStatus(task: Task, nextStatus: TaskStatus) {
    const currentStatus = getTaskBoardStatus(task, today);
    if (!canWrite || currentStatus === nextStatus || pendingId || nextStatus === "overdue") return;
    if (currentStatus === "overdue" && nextStatus !== "done") { toast.error("Просроченную задачу можно только завершить"); return; }
    const previous = tasks;
    setTasks((list) => list.map((item) => item.id === task.id ? { ...item, status: nextStatus } : item));
    setPendingId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось обновить задачу");
      setTasks((list) => list.map((item) => item.id === task.id ? data.task : item));
      toast.success(nextStatus === "done" ? "Задача выполнена" : "Статус задачи обновлён");
      router.refresh();
    } catch (error) {
      setTasks(previous);
      toast.error(error instanceof Error ? error.message : "Ошибка сети");
    } finally { setPendingId(null); }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const target = typeof event.over?.id === "string" ? event.over.id.replace("column:", "") : "";
    if (!event.over || !BOARD_COLUMNS.some((column) => column.status === target)) return;
    const task = tasks.find((item) => item.id === String(event.active.id));
    if (task) void changeStatus(task, target as TaskStatus);
  }
  const activeTask = activeId ? tasks.find((task) => task.id === activeId) : null;
  const getProps = (task: Task): Omit<TaskCardProps, "task" | "boardStatus"> => ({
    isToday: todaySet.has(task.id), assigneeName: assigneeName(task.assigneeId), orderNumber: task.orderId ? orderNumbers[task.orderId] : undefined,
    canWrite, pending: pendingId === task.id, onStatusChange: changeStatus,
  });

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Задачи</h1><p className="mt-1 text-sm tabular-nums text-muted-foreground">{filtered.length === tasks.length ? `Всего: ${tasks.length}` : `Найдено ${filtered.length} из ${tasks.length}`}, на сегодня: {todayIds.filter((id) => tasks.some((task) => task.id === id && task.status !== "done")).length}</p></div>
      {canWrite && <><Button onClick={() => setOpen(true)}><Plus className="size-4" />Новая задача</Button><TaskFormDialog open={open} onOpenChange={setOpen} employees={employees} orders={orders} onCreated={() => router.refresh()} /></>}
    </header>
    <div className="flex flex-col gap-3 sm:flex-row"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-full sm:w-[200px]" aria-label="Статус"><SelectValue placeholder="Статус" /></SelectTrigger><SelectContent><SelectItem value="all">Все статусы</SelectItem>{BOARD_COLUMNS.map((column) => <SelectItem key={column.status} value={column.status}>{column.label}</SelectItem>)}</SelectContent></Select><Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-full sm:w-[200px]" aria-label="Приоритет"><SelectValue placeholder="Приоритет" /></SelectTrigger><SelectContent><SelectItem value="all">Все приоритеты</SelectItem>{(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((item) => <SelectItem key={item} value={item}>{PRIORITY_LABELS[item]}</SelectItem>)}</SelectContent></Select></div>
    {filtered.length === 0 ? <EmptyState icon={Check} title="Задач не найдено" description="Измените фильтр или добавьте новую задачу." /> : <>
      {canWrite && <p className="hidden text-sm text-muted-foreground md:block">Перетащите карточку за ручку на другой этап. Просроченную задачу можно завершить в колонке «Готово».</p>}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => setActiveId(String(event.active.id))} onDragCancel={() => setActiveId(null)} onDragEnd={handleDragEnd}>
        <div className="-mx-4 flex gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 sm:-mx-6 sm:px-6">{BOARD_COLUMNS.map((column) => <KanbanColumn key={column.status} {...column} tasks={grouped[column.status]} getProps={getProps} />)}</div>
        <DragOverlay>{activeTask && <TaskCard task={activeTask} boardStatus={getTaskBoardStatus(activeTask, today)} {...getProps(activeTask)} canWrite={false} pending={false} overlay />}</DragOverlay>
      </DndContext>
    </>}
  </div>;
}
