"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Row = { key: string | null; label: string; used: number };

/** Настройки → Воронка производства. Крупные кнопки для iPad. */
export function ProductionFunnelAdmin({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  }

  function remove(i: number) {
    const row = rows[i];
    if (row.key === "done") {
      toast.error("«Готово» удалить нельзя — его можно переименовать");
      return;
    }
    if (row.used > 0) {
      toast.error(
        `Этап «${row.label}» уже есть в ${row.used} заказ(ах) — удалить нельзя. Переименуйте или переместите его.`,
      );
      return;
    }
    setRows(rows.filter((_, k) => k !== i));
  }

  function add() {
    const label = newLabel.trim();
    if (!label) return;
    setRows([...rows.filter((r) => r.key !== "done"), { key: null, label, used: 0 }, ...rows.filter((r) => r.key === "done")]);
    setNewLabel("");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/production-stages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: rows.map(({ key, label }) => ({ key, label })) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить");
        return;
      }
      setRows(data.stages);
      toast.success("Воронка производства сохранена");
      router.refresh();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Воронка производства</CardTitle>
        <p className="text-sm text-muted-foreground">
          Этапы, которые можно выбрать при создании заказа. Этап, который уже есть в заказах,
          удалить нельзя — только переименовать или переместить.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.key ?? `new-${i}`} className="flex items-center gap-2">
              <span className="w-6 text-right text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <Input
                className="h-12 flex-1 text-base"
                value={row.label}
                maxLength={60}
                aria-label={`Название этапа ${i + 1}`}
                onChange={(e) =>
                  setRows(rows.map((r, k) => (k === i ? { ...r, label: e.target.value } : r)))
                }
              />
              {row.used > 0 && (
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  в заказах: {row.used}
                </span>
              )}
              <Button type="button" variant="outline" className="size-12" aria-label="Выше" disabled={i === 0} onClick={() => move(i, -1)}>
                <ArrowUp className="size-5" />
              </Button>
              <Button type="button" variant="outline" className="size-12" aria-label="Ниже" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>
                <ArrowDown className="size-5" />
              </Button>
              <Button type="button" variant="outline" className="size-12 text-destructive" aria-label="Удалить" onClick={() => remove(i)}>
                <Trash2 className="size-5" />
              </Button>
            </li>
          ))}
        </ol>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="h-12 flex-1 text-base"
            placeholder="Новый этап, например «Упаковка»"
            value={newLabel}
            maxLength={60}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="outline" className="min-h-12" onClick={add} disabled={!newLabel.trim()}>
            <Plus className="size-5" /> Добавить этап
          </Button>
        </div>
        <Button type="button" size="lg" className="min-h-12 w-full sm:w-auto" onClick={save} disabled={saving}>
          {saving ? "Сохранение…" : "Сохранить воронку"}
        </Button>
      </CardContent>
    </Card>
  );
}
