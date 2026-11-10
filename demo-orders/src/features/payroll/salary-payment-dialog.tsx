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
import type { SalaryPayment } from "@/types";

type SalaryPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: { id: string; fullName: string }[];
  payment?: SalaryPayment | null;
  onSaved: () => void;
};

type FormState = { employeeId: string; amount: string; date: string; comment: string };

export function SalaryPaymentDialog({
  open,
  onOpenChange,
  employees,
  payment,
  onSaved,
}: SalaryPaymentDialogProps) {
  const defaultEmployeeId = employees[0]?.id ?? "";
  const [form, setForm] = React.useState<FormState>({
    employeeId: defaultEmployeeId,
    amount: "",
    date: todayDate(),
    comment: "",
  });
  const { busy, run } = useSingleFlight();

  const resetKey = open ? (payment?.id ?? "new") : null;
  const [lastKey, setLastKey] = React.useState<string | null>(null);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    if (resetKey) {
      setForm(
        payment
          ? {
              employeeId: payment.employeeId,
              amount: String(payment.amount),
              date: payment.date.slice(0, 10),
              comment: payment.comment ?? "",
            }
          : { employeeId: defaultEmployeeId, amount: "", date: todayDate(), comment: "" },
      );
    }
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employeeId) return;
    void run(async () => {
      try {
        const res = await fetch(
          payment ? `/api/payroll/salaries/${payment.id}` : "/api/payroll/salaries",
          {
            method: payment ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              employeeId: form.employeeId,
              amount: Number(form.amount),
              date: form.date,
              comment: form.comment.trim() || null,
            }),
          },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось сохранить выплату");
        toast.success(payment ? "Выплата изменена" : "Выплата записана");
        onOpenChange(false);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка сети");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{payment ? "Изменить выплату" : "Выдать зарплату"}</DialogTitle>
          <DialogDescription>Фактическая выдача денег сотруднику.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Сотрудник</Label>
            <Select value={form.employeeId} onValueChange={(v) => set("employeeId", v)}>
              <SelectTrigger aria-label="Сотрудник">
                <SelectValue placeholder="Выберите" />
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
            <Label htmlFor="sal-amount">Сумма, ₸</Label>
            <Input
              id="sal-amount"
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
            <Label htmlFor="sal-date">Дата выплаты</Label>
            <Input
              id="sal-date"
              type="date"
              value={form.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sal-comment">Комментарий</Label>
            <Textarea
              id="sal-comment"
              value={form.comment}
              onChange={(e) => set("comment", e.target.value)}
              placeholder="Например: зарплата за сентябрь"
              rows={2}
            />
          </div>
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
              ) : payment ? (
                "Сохранить"
              ) : (
                "Записать выплату"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
