"use client";

import * as React from "react";
import { Loader2, Paperclip, X } from "lucide-react";
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
import { formatKzt, todayDate } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS, type Advance, type PaymentMethod } from "@/types";

export type AdvanceEmployeeOption = {
  id: string;
  fullName: string;
  limited: boolean;
  totalEarned: number;
  maxAllowed: number;
  available: number;
};

type AdvanceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Without a list the dialog loads employees itself (quick add on the home screen). */
  employees?: AdvanceEmployeeOption[];
  /** Editing an existing record instead of issuing a new one. */
  advance?: Advance | null;
  onSaved: () => void;
};

type FormState = {
  employeeId: string;
  amount: string;
  date: string;
  comment: string;
  paymentMethod: PaymentMethod;
};

function initialForm(advance: Advance | null | undefined, employeeId: string): FormState {
  return advance
    ? {
        employeeId: advance.employeeId,
        amount: String(advance.amount),
        date: advance.date.slice(0, 10),
        comment: advance.comment ?? "",
        paymentMethod: advance.paymentMethod,
      }
    : { employeeId, amount: "", date: todayDate(), comment: "", paymentMethod: "cash" };
}

async function uploadReceipt(advanceId: string, file: File) {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`/api/payroll/advances/${advanceId}/receipt`, { method: "POST", body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Чек не загружен");
}

export function AdvanceDialog({
  open,
  onOpenChange,
  employees: providedEmployees,
  advance,
  onSaved,
}: AdvanceDialogProps) {
  const [loaded, setLoaded] = React.useState<AdvanceEmployeeOption[] | null>(null);
  const employees = providedEmployees ?? loaded ?? [];
  const [form, setForm] = React.useState<FormState>(() => initialForm(advance, ""));
  const [file, setFile] = React.useState<File | null>(null);
  const [dropReceipt, setDropReceipt] = React.useState(false);
  const { busy, run } = useSingleFlight();
  const editing = !!advance;

  const defaultEmployeeId = providedEmployees?.[0]?.id ?? "";
  const selfLoading = !providedEmployees;

  const resetKey = open ? (advance?.id ?? "new") : null;
  const [lastKey, setLastKey] = React.useState<string | null>(null);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    if (resetKey) {
      setForm(initialForm(advance, defaultEmployeeId));
      setFile(null);
      setDropReceipt(false);
    }
  }

  React.useEffect(() => {
    if (!open || !selfLoading) return;
    let cancelled = false;
    fetch("/api/payroll/advances")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось загрузить сотрудников");
        return data.employees as AdvanceEmployeeOption[];
      })
      .then((list) => {
        if (cancelled) return;
        setLoaded(list);
        setForm((f) => (f.employeeId ? f : { ...f, employeeId: list[0]?.id ?? "" }));
      })
      .catch((e: Error) => toast.error(e.message));
    return () => {
      cancelled = true;
    };
  }, [open, selfLoading]);

  const selected = employees.find((e) => e.id === form.employeeId);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId || !form.comment.trim()) return;
    void run(async () => {
      try {
        const res = await fetch(
          advance ? `/api/payroll/advances/${advance.id}` : "/api/payroll/advances",
          {
            method: editing ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: form.employeeId,
              amount: Number(form.amount),
              date: form.date,
              comment: form.comment.trim(),
              paymentMethod: form.paymentMethod,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось сохранить аванс");
        const saved = data.advance as Advance;

        try {
          if (file) {
            await uploadReceipt(saved.id, file);
          } else if (dropReceipt && advance?.receipt) {
            const receiptResponse = await fetch(`/api/payroll/advances/${saved.id}/receipt`, { method: "DELETE" });
            if (!receiptResponse.ok) throw new Error("Не удалось удалить чек");
          }
        } catch (err) {
          toast.error(
            `Аванс сохранён, но чек не прикреплён: ${err instanceof Error ? err.message : "ошибка"}`,
          );
        }

        toast.success(editing ? "Аванс изменён" : "Аванс выдан");
        onOpenChange(false);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка сети");
      }
    });
  }

  const currentReceipt = !dropReceipt ? advance?.receipt : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Изменить аванс" : "Выдать аванс"}</DialogTitle>
          <DialogDescription>
            Запись попадёт в раздел «Зарплаты и авансы» и в историю сотрудника.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Сотрудник</Label>
            <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
              <SelectTrigger aria-label="Сотрудник">
                <SelectValue placeholder={employees.length ? "Выберите" : "Загрузка…"} />
              </SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="adv-amount">Сумма, ₸</Label>
            <Input
              id="adv-amount"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="adv-date">Дата выдачи</Label>
            <Input
              id="adv-date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Способ выдачи</Label>
            <Select
              value={form.paymentMethod}
              onValueChange={(v) => set("paymentMethod", v as PaymentMethod)}
            >
              <SelectTrigger aria-label="Способ выдачи">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="adv-comment">Назначение</Label>
            <Textarea
              id="adv-comment"
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
              placeholder="На что выдан аванс"
              rows={2}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="adv-receipt">Фото чека</Label>
            {currentReceipt && !file ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <a
                  href={currentReceipt.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-w-0 items-center gap-2 text-primary hover:underline"
                >
                  <Paperclip className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{currentReceipt.name}</span>
                </a>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setDropReceipt(true)}
                  aria-label="Убрать чек"
                >
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <Input
                id="adv-receipt"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            )}
          </div>
          {selected && (
            <p className="rounded-lg bg-panel-elevated px-4 py-3 text-sm text-muted-foreground sm:col-span-2">
              {selected.limited
                ? `Заработано ${formatKzt(selected.totalEarned)}, лимит ${formatKzt(selected.maxAllowed)}, доступно ${formatKzt(selected.available)}`
                : "Оклад: лимит от выработки не применяется"}
            </p>
          )}
          <DialogFooter className="gap-2 sm:col-span-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={busy || !form.employeeId}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Сохранение…
                </>
              ) : editing ? (
                "Сохранить"
              ) : (
                "Выдать аванс"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
