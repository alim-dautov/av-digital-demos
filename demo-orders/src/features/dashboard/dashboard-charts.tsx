"use client";

import type { ReactNode } from "react";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { formatKzt } from "@/lib/utils";
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chart-theme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const STATUS_COLORS = [
  "#6B7280",
  "#94A3B8",
  "#60A5FA",
  "#A78BFA",
  "#E98C55",
  "#F59E0B",
  "#22C55E",
];

const SOURCE_COLORS = [
  "#E1306C",
  "#E98C55",
  "#60A5FA",
  "#F59E0B",
  "#9CA39C",
];

const DONUT_SIZE = 176;
const DONUT_INNER = 52;
const DONUT_OUTER = 80;

export type StatusSlice = {
  status: string;
  label: string;
  count: number;
  percent: number;
};

export type LeadSlice = {
  source: string;
  label: string;
  count: number;
  amount: number;
  percent: number;
};

type LegendItem = {
  key: string;
  label: string;
  color: string;
  value: ReactNode;
};

type DonutCardProps<T extends { count: number }> = {
  title: string;
  description: string;
  data: T[];
  colors: string[];
  total: number;
  totalLabel: string;
  legend: LegendItem[];
  tooltip: (value: unknown, payload: T | undefined) => [string, string];
};

function DonutCard<T extends { count: number }>({
  title,
  description,
  data,
  colors,
  total,
  totalLabel,
  legend,
  tooltip,
}: DonutCardProps<T>) {
  const colored = data
    .map((d, i) => ({ d, color: colors[i % colors.length] }))
    .filter(({ d }) => d.count > 0);
  const chartData = colored.map(({ d }) => d);

  return (
    <Card className="@container h-full min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <EmptyState
            compact
            icon={PieChartIcon}
            title="Пока нет данных"
            description="График появится, когда в системе будут заказы."
            className="min-h-[176px]"
          />
        ) : (
          <div className="flex flex-col items-center gap-5 @sm:flex-row">
            <div
              className="relative shrink-0"
              style={{ width: DONUT_SIZE, height: DONUT_SIZE }}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={DONUT_INNER}
                    outerRadius={DONUT_OUTER}
                    paddingAngle={2}
                    stroke="transparent"
                  >
                    {colored.map(({ color }, i) => (
                      <Cell key={i} fill={color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                    formatter={(value, _name, item) =>
                      tooltip(value, item?.payload as T | undefined)
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-semibold tabular-nums">{total}</span>
                <span className="text-xs text-muted-foreground">{totalLabel}</span>
              </div>
            </div>
            <ul className="w-full min-w-0 flex-1 space-y-2">
              {legend.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    <span className="truncate text-muted-foreground">
                      {item.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type StatusDonutProps = {
  data: StatusSlice[];
};

export function StatusDonutChart({ data }: StatusDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <DonutCard
      title="Статусы заказов"
      description="Распределение по воронке"
      data={data}
      colors={STATUS_COLORS}
      total={total}
      totalLabel="всего"
      legend={data.map((d, i) => ({
        key: d.status,
        label: d.label,
        color: STATUS_COLORS[i % STATUS_COLORS.length],
        value: (
          <>
            {d.count}
            <span className="ml-1 text-muted-foreground">· {d.percent}%</span>
          </>
        ),
      }))}
      tooltip={(value, payload) => [
        `${value} (${payload?.percent ?? 0}%)`,
        payload?.label ?? "",
      ]}
    />
  );
}

type LeadDonutProps = {
  data: LeadSlice[];
};

export function LeadSourcesDonutChart({ data }: LeadDonutProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <DonutCard
      title="Источники лидов"
      description="Откуда приходят заказы"
      data={data}
      colors={SOURCE_COLORS}
      total={total}
      totalLabel="лидов"
      legend={data.map((d, i) => ({
        key: d.source,
        label: d.label,
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
        value: `${d.percent}%`,
      }))}
      tooltip={(value, payload) => [
        `${value} · ${formatKzt(payload?.amount ?? 0)}`,
        payload?.label ?? "",
      ]}
    />
  );
}

type DashboardChartsProps = {
  statusDistribution: StatusSlice[];
  leadSources: LeadSlice[];
};

/** Combined client island for donut charts used on the dashboard. */
export function DashboardCharts({
  statusDistribution,
  leadSources,
}: DashboardChartsProps) {
  return (
    <>
      <StatusDonutChart data={statusDistribution} />
      <LeadSourcesDonutChart data={leadSources} />
    </>
  );
}
