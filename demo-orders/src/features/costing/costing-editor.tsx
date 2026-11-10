"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKzt } from "@/lib/utils";
import type { OrderProfitRow } from "@/lib/services/atelier-profit";
import type { ExpenseCategory, OrderExpense } from "@/types";

type Payload = {
  expenses: OrderExpense[];
  categories: ExpenseCategory[];
  sync?: { added: number; updated: number; removed: number; kept: number };
};

async function request(url: string, method: string, body?: unknown): Promise<Payload> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Payload & { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Не удалось сохранить");
  return json;
}

function toAmount(value: string): number | null {
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ExpenseRow({
  expense,
  categories,
  canWrite,
  onSave,
  onReset,
  onDelete,
}: {
  expense: OrderExpense;
  categories: ExpenseCategory[];
  canWrite: boolean;
  onSave: (patch: { amount?: number; category?: string; note?: string | null }) => void;
  onReset: () => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState(String(expense.amount));
  const [note, setNote] = useState(expense.note ?? "");
  const fromCalc = expense.source === "calculator";

  function commitAmount() {
    const n = toAmount(amount);
    if (n === null) {
      toast.error("Сумма должна быть числом от 0");
      setAmount(String(expense.amount));
      return;
    }
    if (Math.round(n) !== expense.amount) onSave({ amount: n });
  }

  return (
    <li className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_8rem] sm:items-center">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium">{expense.name}</p>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {fromCalc ? (
            <>
              <Badge variant="outline">калькулятор</Badge>
              <span className="tabular-nums">расчёт {formatKzt(expense.plannedAmount ?? 0)}</span>
              {expense.edited && <Badge variant="warning">изменено вручную</Badge>}
            </>
          ) : (
            <Badge variant="secondary">вручную</Badge>
          )}
        </div>
        {canWrite ? (
          <Input
            value={note}
            placeholder="Комментарий"
            className="h-8 text-xs"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => {
              if ((expense.note ?? "") !== note.trim()) onSave({ note: note.trim() || null });
            }}
          />
        ) : (
          expense.note && <p className="text-xs text-muted-foreground">{expense.note}</p>
        )}
      </div>
      {canWrite ? (
        <Select value={expense.category} onValueChange={(v) => onSave({ category: v })}>
          <SelectTrigger className="h-9" aria-label="Категория">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.key} value={c.key}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-1">
        {canWrite ? (
          <Input
            inputMode="decimal"
            aria-label={`Сумма: ${expense.name}`}
            className="h-9 text-right tabular-nums"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={commitAmount}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        ) : (
          <span className="w-full text-right text-sm font-medium tabular-nums">
            {formatKzt(expense.amount)}
          </span>
        )}
        {canWrite && fromCalc && expense.edited && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            title="Вернуть сумму из калькулятора"
            onClick={onReset}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
        {canWrite && !fromCalc && (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
            title="Удалить"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

export function CostingEditor({
  order,
  profit,
  expenses: initialExpenses,
  categories: initialCategories,
  canWrite,
}: {
  order: { id: string; number: string; status: string; hasQuote: boolean };
  profit: OrderProfitRow;
  expenses: OrderExpense[];
  categories: ExpenseCategory[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [expenses, setExpenses] = useState(initialExpenses);
  const [categories, setCategories] = useState(initialCategories);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ category: "materials", name: "", amount: "" });
  const [newCategory, setNewCategory] = useState("");
  const base = `/api/orders/${order.id}/expenses`;

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const planned = expenses.reduce((s, e) => s + (e.plannedAmount ?? 0), 0);
  const net = profit.revenue - total;
  const margin = profit.revenue > 0 ? Math.round((net / profit.revenue) * 1000) / 10 : 0;

  const groups = useMemo(() => {
    const known = new Set(categories.map((c) => c.key));
    const list = categories.map((c) => ({
      key: c.key,
      label: c.label,
      items: expenses.filter((e) => e.category === c.key),
    }));
    const orphan = expenses.filter((e) => !known.has(e.category));
    if (orphan.length) list.push({ key: "__unknown", label: "Без категории", items: orphan });
    return list.filter((g) => g.items.length > 0);
  }, [categories, expenses]);

  async function run(fn: () => Promise<Payload>, success?: (p: Payload) => string | null) {
    setBusy(true);
    try {
      const p = await fn();
      setExpenses(p.expenses);
      setCategories(p.categories);
      const msg = success?.(p);
      if (msg) toast.success(msg);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  function addExpense() {
    const amount = toAmount(draft.amount);
    if (!draft.name.trim() || amount === null) {
      toast.error("Укажите название и сумму");
      return;
    }
    void run(
      () => request(base, "POST", { category: draft.category, name: draft.name, amount }),
      () => "Расход добавлен",
    ).then(() => setDraft((d) => ({ ...d, name: "", amount: "" })));
  }

  const kpis = [
    { label: "Сумма заказа", value: formatKzt(profit.revenue) },
    { label: "Расчёт калькулятора", value: formatKzt(planned) },
    { label: "Фактические расходы", value: formatKzt(total) },
    {
      label: "Чистая прибыль",
      value: formatKzt(net),
      tone: net < 0 ? "text-destructive" : undefined,
    },
    { label: "Маржа", value: `${margin}%`, tone: net < 0 ? "text-destructive" : undefined },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Заказ{" "}
          <Link href={`/orders/${order.number}`} className="font-medium text-primary hover:underline">
            №{order.number}
          </Link>{" "}
          · {profit.clientName} · {order.status}
        </p>
        {canWrite && order.hasQuote && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => request(base, "POST", { action: "sync" }),
                (p) =>
                  p.sync
                    ? `Из калькулятора: добавлено ${p.sync.added}, обновлено ${p.sync.updated}, удалено ${p.sync.removed}`
                    : null,
              )
            }
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            Подтянуть из калькулятора
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border border-border bg-panel p-4">
            <dt className="text-xs text-muted-foreground">{k.label}</dt>
            <dd className={cn("mt-1 text-lg font-semibold tabular-nums tracking-tight", k.tone)}>
              {k.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-muted-foreground">
        Изменение фактических сумм не меняет расчёт в калькуляторе. Строки калькулятора
        обновляются при сохранении расчёта, а суммы, изменённые вручную, сохраняются.
      </p>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Расходы ещё не внесены
        </p>
      ) : (
        groups.map((g) => (
          <Card key={g.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{g.label}</CardTitle>
              <span className="text-sm font-semibold tabular-nums">
                {formatKzt(g.items.reduce((s, e) => s + e.amount, 0))}
              </span>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border border-t border-border">
                {g.items.map((e) => (
                  <ExpenseRow
                    key={`${e.id}:${e.updatedAt}`}
                    expense={e}
                    categories={categories}
                    canWrite={canWrite && !busy}
                    onSave={(patch) => void run(() => request(base, "PATCH", { expenseId: e.id, ...patch }))}
                    onReset={() =>
                      void run(() => request(base, "PATCH", { expenseId: e.id, resetToPlanned: true }))
                    }
                    onDelete={() =>
                      void run(
                        () => request(`${base}?expenseId=${encodeURIComponent(e.id)}`, "DELETE"),
                        () => "Расход удалён",
                      )
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      {canWrite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Добавить расход</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_10rem_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                addExpense();
              }}
            >
              <div className="space-y-1.5">
                <Label>Категория</Label>
                <Select
                  value={draft.category}
                  onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.key} value={c.key}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-name">Название</Label>
                <Input
                  id="expense-name"
                  value={draft.name}
                  placeholder="Например, такси до клиента"
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="expense-amount">Сумма, ₸</Label>
                <Input
                  id="expense-amount"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))}
                />
              </div>
              <Button type="submit" disabled={busy}>
                <Plus className="size-4" />
                Добавить
              </Button>
            </form>

            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-sm font-medium">Категории расходов</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Badge key={c.id} variant="outline" className="gap-1 py-1">
                    {c.label}
                    {!c.system && (
                      <button
                        type="button"
                        aria-label={`Удалить категорию ${c.label}`}
                        className="rounded text-muted-foreground hover:text-destructive"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            async () => {
                              const res = await fetch(
                                `/api/expense-categories?id=${encodeURIComponent(c.id)}`,
                                { method: "DELETE" },
                              );
                              const json = (await res.json().catch(() => ({}))) as {
                                error?: string;
                                categories?: ExpenseCategory[];
                              };
                              if (!res.ok) throw new Error(json.error ?? "Не удалось удалить");
                              return { expenses, categories: json.categories ?? categories };
                            },
                            () => "Категория удалена",
                          )
                        }
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </Badge>
                ))}
              </div>
              <form
                className="flex max-w-md gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const label = newCategory.trim();
                  if (!label) return;
                  void run(
                    async () => {
                      const res = await fetch("/api/expense-categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ label }),
                      });
                      const json = (await res.json().catch(() => ({}))) as {
                        error?: string;
                        categories?: ExpenseCategory[];
                      };
                      if (!res.ok) throw new Error(json.error ?? "Не удалось добавить");
                      return { expenses, categories: json.categories ?? categories };
                    },
                    () => "Категория добавлена",
                  ).then(() => setNewCategory(""));
                }}
              >
                <Input
                  value={newCategory}
                  placeholder="Новая категория, например «Упаковка»"
                  onChange={(e) => setNewCategory(e.target.value)}
                />
                <Button type="submit" variant="outline" disabled={busy}>
                  Добавить
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
