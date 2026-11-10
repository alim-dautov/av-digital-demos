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
import { useSingleFlight } from "@/lib/use-single-flight";
import { todayDate } from "@/lib/utils";

type CashEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "in" | "out";
  onSaved: () => void;
};

const EMPTY = { amount: "", date: "", category: "", comment: "" };

export function CashEntryDialog({ open, onOpenChange, type, onSaved }: CashEntryDialogProps) {
  const [form, setForm] = React.useState({ ...EMPTY, date: todayDate() });
  const { busy, run } = useSingleFlight();
  const label = type === "in" ? "Приход" : "Расход";

  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm({ ...EMPTY, date: todayDate() });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void run(async () => {
      try {
        const res = await fetch("/api/cash", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            amount: Number(form.amount.replace(/\s/g, "").replace(",", ".")),
            date: form.date,
            category: form.category.trim() || label,
            comment: form.comment.trim() || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось записать операцию");
        toast.success(type === "in" ? "Приход записан" : "Расход записан");
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
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            {type === "in" ? "Поступление денег в кассу" : "Выдача денег из кассы"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cash-amount">Сумма, ₸</Label>
            <Input
              id="cash-amount"
              type="number"
              inputMode="decimal"
              min={1}
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-date">Дата</Label>
            <Input
              id="cash-date"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              required
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cash-category">Категория</Label>
            <Input
              id="cash-category"
              value={form.category}
              placeholder={label}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              maxLength={80}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="cash-comment">Комментарий</Label>
            <Input
              id="cash-comment"
              value={form.comment}
              onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
              maxLength={500}
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
            <Button type="submit" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Сохранение…
                </>
              ) : (
                "Записать"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
