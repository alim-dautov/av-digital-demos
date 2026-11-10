"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FINANCE_CATEGORIES,
  FINANCE_CATEGORY_LABELS,
  type FinanceCategory,
  type FinanceCounts,
} from "@/lib/domain/finance-categories";

/** Payroll is unticked by default: it is about people, not test orders. */
const DEFAULT_ON: FinanceCategory[] = ["payments", "cash", "purchases", "orderExpenses"];

export function FinanceResetAdmin() {
  const router = useRouter();
  const [counts, setCounts] = useState<FinanceCounts | null>(null);
  const [selected, setSelected] = useState<Set<FinanceCategory>>(new Set(DEFAULT_ON));
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/finance-reset")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { counts: FinanceCounts } | null) => setCounts(j?.counts ?? null));
  }, []);

  if (!counts) return null;
  const chosen = FINANCE_CATEGORIES.filter((c) => selected.has(c));
  const total = chosen.reduce((n, c) => n + counts[c], 0);

  async function reset() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/finance-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim(), categories: chosen }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        backup?: string;
        counts?: FinanceCounts;
      };
      if (!res.ok) throw new Error(json.error ?? "Не удалось удалить");
      toast.success(`Финансовые данные удалены. Резервная копия: ${json.backup ?? "—"}`);
      if (json.counts) setCounts(json.counts);
      setTyped("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Очистка данных</CardTitle>
        <CardDescription>
          Удаляет финансовые записи только этой компании. Сотрудники, клиенты, заказы, прайсы,
          материалы, настройки и галерея остаются. Перед удалением сервер сохраняет полную копию базы.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {FINANCE_CATEGORIES.map((c) => (
            <li key={c}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2">
                <Checkbox
                  className="size-5"
                  checked={selected.has(c)}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const next = new Set(s);
                      if (v) next.add(c);
                      else next.delete(c);
                      return next;
                    })
                  }
                />
                <span className="flex-1 text-sm">{FINANCE_CATEGORY_LABELS[c]}</span>
                <span className="text-sm tabular-nums text-muted-foreground">{counts[c]}</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="finance-reset-confirm">Для подтверждения введите УДАЛИТЬ</Label>
          <Input
            id="finance-reset-confirm"
            className="h-12 text-base"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
          />
        </div>
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="h-12 w-full text-base"
          disabled={busy || chosen.length === 0 || typed.trim() !== "УДАЛИТЬ"}
          onClick={() => void reset()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
          Удалить все финансовые данные ({total})
        </Button>
      </CardContent>
    </Card>
  );
}
