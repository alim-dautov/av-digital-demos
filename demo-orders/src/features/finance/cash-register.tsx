"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSingleFlight } from "@/lib/use-single-flight";
import { formatDateRu, formatKzt, todayDate } from "@/lib/utils";
import type { CashEntry } from "@/types";

function money(text: string): number {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

export function CashRegister({
  entries,
  balance,
  canWrite,
}: {
  entries: CashEntry[];
  balance: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const submitting = useSingleFlight();
  const [type, setType] = useState<"in" | "out">("in");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDate());
  const [category, setCategory] = useState("");
  const [comment, setComment] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    void submitting.run(async () => {
      const res = await fetch("/api/cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          amount: money(amount),
          date,
          category: category.trim() || (type === "in" ? "Приход" : "Расход"),
          comment,
        }),
      }).catch(() => null);
      const data = await res?.json().catch(() => ({}));
      if (!res?.ok) {
        toast.error(data?.error || "Не удалось записать операцию");
        return;
      }
      setAmount("");
      setComment("");
      setCategory("");
      toast.success("Операция записана");
      startTransition(() => router.refresh());
    });
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Касса</h2>
          <p className="text-sm text-muted-foreground">Приход и расход. Предоплаты и закуп попадают сюда сами.</p>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{formatKzt(balance)}</p>
      </div>
      {canWrite && (
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-5">
          <div>
            <Label>Тип</Label>
            <Select value={type} onValueChange={(value) => setType(value as "in" | "out")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in">Приход</SelectItem>
                <SelectItem value="out">Расход</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="cash-amount">Сумма, ₸</Label>
            <Input
              id="cash-amount"
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cash-date">Дата</Label>
            <Input id="cash-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="cash-category">Категория</Label>
            <Input id="cash-category" value={category} onChange={(event) => setCategory(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="cash-comment">Комментарий</Label>
            <Input id="cash-comment" value={comment} onChange={(event) => setComment(event.target.value)} />
          </div>
          <div className="sm:col-span-5">
            <Button
              type="submit"
              className="w-full sm:w-auto"
              disabled={pending || submitting.busy}
            >
              Записать
            </Button>
          </div>
        </form>
      )}
      <ul className="divide-y divide-border text-sm">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-baseline justify-between gap-3 py-2">
            <div>
              <p>
                {formatDateRu(entry.date)} · {entry.category}
              </p>
              {entry.comment ? <p className="text-muted-foreground">{entry.comment}</p> : null}
            </div>
            <p className={entry.type === "in" ? "tabular-nums text-success" : "tabular-nums text-destructive"}>
              {entry.type === "in" ? "+" : "−"}
              {formatKzt(entry.amount)}
            </p>
          </li>
        ))}
        {entries.length === 0 && <li className="py-3 text-muted-foreground">Операций пока нет</li>}
      </ul>
    </section>
  );
}
