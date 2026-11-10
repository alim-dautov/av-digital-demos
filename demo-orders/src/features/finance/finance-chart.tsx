"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatKzt } from "@/lib/utils";
import {
  CHART_TOOLTIP_ITEM_STYLE,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/lib/chart-theme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const ACCENT = "var(--primary)";
const AXIS_TICK = { fill: "var(--chart-axis)", fontSize: 11 };

export type FinanceChartPoint = {
  label: string;
  revenue: number;
  profit: number;
  expenses: number;
};

type Props = {
  data: FinanceChartPoint[];
};

export function FinanceChart({ data }: Props) {
  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Динамика за месяц</CardTitle>
          <CardDescription>Выручка и прибыль по дням</CardDescription>
        </div>
        <ul className="flex items-center gap-4 text-xs text-muted-foreground" aria-label="Легенда">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-primary" aria-hidden />
            Выручка
          </li>
          <li className="flex items-center gap-1.5">
            <span
              className="h-0 w-4 border-t-[1.5px] border-dashed border-[var(--chart-positive)]"
              aria-hidden
            />
            Прибыль
          </li>
        </ul>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className="h-[240px] w-full"
          role="img"
          aria-label={`График выручки и прибыли по дням, ${data.length} точек`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="finRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={56}
                tickFormatter={(v) =>
                  v >= 1_000_000
                    ? `${Math.round(v / 1_000_000)}м`
                    : v >= 1000
                      ? `${Math.round(v / 1000)}к`
                      : String(v)
                }
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                formatter={(value, name) => [
                  formatKzt(Number(value ?? 0)),
                  name === "revenue" ? "Выручка" : "Прибыль",
                ]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={ACCENT}
                fill="url(#finRevenue)"
                strokeWidth={2}
                name="revenue"
              />
              <Area
                type="monotone"
                dataKey="profit"
                stroke="var(--chart-positive)"
                fill="transparent"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                name="profit"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Расходы</p>
        <div
          className="h-[180px] w-full"
          role="img"
          aria-label="График расходов по дням"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.filter((_, i) => i % 3 === 0 || i === data.length - 1)}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                itemStyle={CHART_TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "var(--chart-grid)" }}
                formatter={(value) => [formatKzt(Number(value ?? 0)), "Расходы"]}
              />
              <Bar dataKey="expenses" fill={ACCENT} fillOpacity={0.55} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </div>
      </CardContent>
    </Card>
  );
}
