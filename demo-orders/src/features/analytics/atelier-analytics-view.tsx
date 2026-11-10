"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatKzt } from "@/lib/utils";
import type { getAtelierAnalytics } from "@/lib/services/atelier-analytics";

type Snapshot = ReturnType<typeof getAtelierAnalytics>;
type Period = Snapshot["period"];

const PERIODS: { id: Period; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
];

export function AtelierAnalyticsView({
  periods,
}: {
  periods: Record<Period, Snapshot>;
}) {
  const [period, setPeriod] = useState<Period>("month");
  const data = periods[period];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Аналитика</h1>
          <p className="mt-1 text-sm text-muted-foreground">Заказы и источники клиентов</p>
        </div>
        <div className="flex gap-2">
          {PERIODS.map((item) => (
            <Button
              key={item.id}
              type="button"
              size="sm"
              variant={period === item.id ? "default" : "outline"}
              onClick={() => setPeriod(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </header>
      <section className="grid gap-3 sm:grid-cols-3">
        <Stat label="Заказы" value={String(data.ordersCount)} />
        <Stat label="Сумма" value={formatKzt(data.ordersSum)} />
        <Stat label="Средний чек" value={formatKzt(data.averageCheck)} />
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-panel p-4">
          <h2 className="font-semibold">По статусам</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.statuses
              .filter((row) => row.count > 0)
              .map((row) => (
                <li key={row.status} className="flex justify-between gap-3">
                  <span>
                    {row.label} · {row.count}
                  </span>
                  <span className="tabular-nums">{formatKzt(row.amount)}</span>
                </li>
              ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-panel p-4">
          <h2 className="font-semibold">Откуда пришли клиенты</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.sources.map((row) => (
              <li key={row.key} className="flex justify-between gap-3">
                <span>
                  {row.label}: {row.clients} кл. · {row.orders} зак.
                </span>
                <span className="tabular-nums">{formatKzt(row.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-panel p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
