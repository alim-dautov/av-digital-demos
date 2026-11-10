"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemoDataReport } from "@/lib/services/demo-cleanup";

function total(r: DemoDataReport): number {
  return (
    r.users.length +
    r.employees.length +
    r.clients.length +
    r.orders.length +
    r.proposals +
    r.measurements +
    r.tasks +
    r.notifications +
    r.activity +
    r.other
  );
}

export function DemoDataAdmin() {
  const router = useRouter();
  const [report, setReport] = useState<DemoDataReport | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/settings/demo-data")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { report: DemoDataReport } | null) => setReport(j?.report ?? null));
  }, []);

  if (!report || total(report) === 0) return null;

  async function purge() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings/demo-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; backup?: string };
      if (!res.ok) throw new Error(json.error ?? "Не удалось удалить");
      toast.success(`Тестовые данные удалены. Резервная копия: ${json.backup ?? "—"}`);
      setReport(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  const lists: [string, { id: string; label: string }[]][] = [
    ["Учётные записи", report.users],
    ["Сотрудники", report.employees],
    ["Клиенты", report.clients],
    ["Заказы", report.orders],
  ];
  const counters: [string, number][] = [
    ["КП", report.proposals],
    ["Замеры", report.measurements],
    ["Задачи", report.tasks],
    ["Уведомления", report.notifications],
    ["Журнал действий", report.activity],
    ["Фото, расходы, подписки", report.other],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Тестовые данные</CardTitle>
        <CardDescription>
          Найдены записи, похожие на тестовые: в названии есть «тест», «test», «демо» или «e2e».
          Проверьте список перед удалением. Перед удалением создаётся резервная копия базы.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {lists.map(([title, items]) =>
          items.length > 0 ? (
            <div key={title}>
              <p className="mb-1 font-medium">
                {title}: {items.length}
              </p>
              <ul className="max-h-40 list-inside list-disc overflow-y-auto text-muted-foreground">
                {items.map((i) => (
                  <li key={i.id} className="truncate">
                    {i.label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null,
        )}
        <p className="text-muted-foreground">
          Связанные записи:{" "}
          {counters
            .filter(([, n]) => n > 0)
            .map(([label, n]) => `${label} ${n}`)
            .join(", ") || "нет"}
        </p>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-destructive">Удалить {total(report)} записей без возможности отмены в приложении?</span>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void purge()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Да, удалить
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Отмена
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="size-4" />
            Удалить тестовые данные
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
