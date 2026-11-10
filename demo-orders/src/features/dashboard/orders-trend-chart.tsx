"use client";

import { useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatKzt } from "@/lib/utils";
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chart-theme";
import { LineChart as LineChartIcon } from "lucide-react";
import type { AnalyticsPeriod } from "@/lib/services/analytics";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type TrendPoint = {
  label: string;
  orders: number;
  revenue: number;
  profit: number;
};

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

const ACCENT = "var(--primary)";
const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 11 };

type Props = {
  initialPeriod?: AnalyticsPeriod;
  initialData: TrendPoint[];
  /** Hide built-in period buttons when parent controls the period. */
  hidePeriodSwitcher?: boolean;
};

export function OrdersTrendChart({
  initialPeriod = "month",
  initialData,
  hidePeriodSwitcher = false,
}: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialPeriod);
  const [data, setData] = useState<TrendPoint[]>(initialData);
  const [isPending, startTransition] = useTransition();
  const isEmpty = data.every((d) => d.orders === 0 && d.revenue === 0);

  function selectPeriod(next: AnalyticsPeriod) {
    if (next === period) return;
    setPeriod(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/dashboard/trend?period=${next}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          trend: TrendPoint[];
        };
        setData(json.trend);
      } catch {
        /* keep previous data */
      }
    });
  }

  return (
    <Card className="h-full">
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Динамика заказов</CardTitle>
          <CardDescription>Количество и выручка по периодам</CardDescription>
        </div>
        {!hidePeriodSwitcher && (
          <div
            role="group"
            aria-label="Период"
            className="inline-flex max-w-full shrink-0 gap-0.5 scroll-x rounded-md bg-panel-elevated p-0.5"
          >
            {PERIODS.map((p) => {
              const active = period === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={active}
                  disabled={isPending}
                  onClick={() => selectPeriod(p.value)}
                  className={cn(
                    "h-7 shrink-0 rounded-sm px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait",
                    active
                      ? "bg-panel text-foreground dark:bg-foreground/[0.08]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent
        aria-busy={isPending}
        className={cn(
          "transition-opacity duration-200",
          isPending && "opacity-60",
        )}
      >
        {isEmpty ? (
          <EmptyState
            compact
            icon={LineChartIcon}
            title="Нет данных за период"
            description="Выберите другой период или создайте первый заказ."
            className="h-[260px]"
          />
        ) : (
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="orders"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="revenue"
                  orientation="right"
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                  tickFormatter={(v: number) =>
                    v >= 1_000_000
                      ? `${Math.round(v / 1_000_000)}M`
                      : v >= 1000
                        ? `${Math.round(v / 1000)}k`
                        : String(v)
                  }
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                  formatter={(value, name) => {
                    const n = Number(value ?? 0);
                    if (name === "revenue" || name === "profit") {
                      return [formatKzt(n), name === "revenue" ? "Выручка" : "Прибыль"];
                    }
                    return [n, "Заказы"];
                  }}
                />
                <Line
                  yAxisId="orders"
                  type="monotone"
                  dataKey="orders"
                  name="orders"
                  stroke={ACCENT}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="revenue"
                  name="revenue"
                  stroke={ACCENT}
                  strokeOpacity={0.4}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {!isEmpty && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden />
              Заказы
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="w-4 border-t border-dashed border-primary/50"
                aria-hidden
              />
              Выручка
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
