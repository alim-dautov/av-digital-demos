"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  HandCoins,
  ListPlus,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CashEntryDialog } from "@/features/finance/cash-entry-dialog";
import { AdvanceDialog } from "@/features/payroll/advance-dialog";
import { TaskFormDialog } from "@/features/tasks/task-form-dialog";
import { can } from "@/lib/rbac";
import { cn } from "@/lib/utils";
import type { SessionUser } from "@/types";

type Action = "task" | "cash_in" | "cash_out" | "advance";

type ActionItem = { id: Action; label: string; hint: string; icon: LucideIcon; tone: string };

const ACTIONS: ActionItem[] = [
  { id: "task", label: "Задача", hint: "Новая задача", icon: ListPlus, tone: "text-primary" },
  { id: "cash_in", label: "Приход", hint: "Деньги в кассу", icon: ArrowDownLeft, tone: "text-success" },
  { id: "cash_out", label: "Расход", hint: "Деньги из кассы", icon: ArrowUpRight, tone: "text-destructive" },
  { id: "advance", label: "Аванс", hint: "Выдать сотруднику", icon: HandCoins, tone: "text-warning" },
];

function allowed(user: SessionUser, action: Action): boolean {
  switch (action) {
    case "task":
      return can(user, "tasks", "write");
    case "cash_in":
    case "cash_out":
      return can(user, "finance", "write");
    case "advance":
      return can(user, "payroll", "write");
  }
}

export function QuickAddButton({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [action, setAction] = React.useState<Action | null>(null);
  const [cashType, setCashType] = React.useState<"in" | "out">("in");
  const actions = ACTIONS.filter((a) => allowed(user, a.id));
  const refresh = React.useCallback(() => router.refresh(), [router]);

  if (actions.length === 0) return null;

  function choose(next: Action) {
    setMenuOpen(false);
    if (next === "cash_in" || next === "cash_out") setCashType(next === "cash_in" ? "in" : "out");
    setAction(next);
  }

  const close = (open: boolean) => {
    if (!open) setAction(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Быстрое добавление"
        aria-haspopup="dialog"
        className="touch-manipulation fixed right-4 z-40 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bottom-[calc(5rem+var(--safe-bottom))] md:bottom-8 md:right-8"
      >
        <Plus className="size-7" aria-hidden />
      </button>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-xl sm:mx-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Быстрое добавление</SheetTitle>
          </SheetHeader>
          <ul className="mt-4 grid grid-cols-2 gap-2 pb-2">
            {actions.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => choose(a.id)}
                  className="touch-manipulation flex min-h-20 w-full flex-col items-start justify-center gap-1 rounded-lg bg-panel-elevated px-4 py-3 text-left transition-none active:bg-primary/30 [@media(hover:hover)]:hover:bg-foreground/10"
                >
                  <a.icon className={cn("size-6", a.tone)} aria-hidden />
                  <span className="text-base font-semibold">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      {allowed(user, "task") && (
        <TaskFormDialog open={action === "task"} onOpenChange={close} onCreated={refresh} />
      )}
      {allowed(user, "cash_in") && (
        <CashEntryDialog
          open={action === "cash_in" || action === "cash_out"}
          onOpenChange={close}
          type={cashType}
          onSaved={refresh}
        />
      )}
      {allowed(user, "advance") && (
        <AdvanceDialog open={action === "advance"} onOpenChange={close} onSaved={refresh} />
      )}
    </>
  );
}
