"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSingleFlight } from "@/lib/use-single-flight";
import { todayDate } from "@/lib/utils";
import type { TaskPriority } from "@/types";

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
};

export type TaskEmployeeOption = { id: string; fullName: string };
export type TaskOrderOption = { id: string; number: string; description: string };

type TaskFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Without lists the dialog loads them itself (quick add on the home screen). */
  employees?: TaskEmployeeOption[];
  orders?: TaskOrderOption[];
  onCreated: () => void;
};

const EMPTY_FORM = {
  title: "",
  description: "",
  deadline: "",
  priority: "medium" as TaskPriority,
  assigneeId: "",
  orderId: "",
};

export function TaskFormDialog({
  open,
  onOpenChange,
  employees: providedEmployees,
  orders: providedOrders,
  onCreated,
}: TaskFormDialogProps) {
  const [options, setOptions] = React.useState<{
    employees: TaskEmployeeOption[];
    orders: TaskOrderOption[];
  } | null>(null);
  const employees = providedEmployees ?? options?.employees ?? [];
  const orders = providedOrders ?? options?.orders ?? [];
  const selfLoading = !providedEmployees || !providedOrders;
  const [form, setForm] = React.useState({ ...EMPTY_FORM, deadline: todayDate() });
  const { busy, run } = useSingleFlight();

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ ...EMPTY_FORM, deadline: todayDate() });
  }

  React.useEffect(() => {
    if (!open || !selfLoading) return;
    let cancelled = false;
    fetch("/api/tasks/options")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setOptions(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, selfLoading]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            deadline: form.deadline,
            priority: form.priority,
            assigneeId: form.assigneeId || null,
            orderId: form.orderId || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Не удалось создать задачу");
          return;
        }
        toast.success("Задача создана");
        onOpenChange(false);
        onCreated();
      } catch {
        toast.error("Ошибка сети");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
          <DialogDescription>Создайте задачу для команды</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Название</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-desc">Описание</Label>
            <Textarea
              id="task-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="deadline">Срок</Label>
              <Input
                id="deadline"
                type="date"
                value={form.deadline}
                onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Приоритет</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => setForm((f) => ({ ...f, priority: v as TaskPriority }))}
              >
                <SelectTrigger aria-label="Приоритет">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(PRIORITY_LABELS) as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Исполнитель</Label>
            <Select
              value={form.assigneeId || "none"}
              onValueChange={(v) => setForm((f) => ({ ...f, assigneeId: v === "none" ? "" : v }))}
            >
              <SelectTrigger aria-label="Исполнитель">
                <SelectValue placeholder="Не назначен" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Не назначен</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {orders.length > 0 && (
            <div className="space-y-2">
              <Label>Заказ</Label>
              <Select
                value={form.orderId || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, orderId: v === "none" ? "" : v }))}
              >
                <SelectTrigger aria-label="Заказ">
                  <SelectValue placeholder="Без заказа" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без заказа</SelectItem>
                  {orders.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      №{o.number}: {o.description.slice(0, 40)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Сохранение…
                </>
              ) : (
                "Создать"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
