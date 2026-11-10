"use client";

import { useState, useTransition } from "react";
import {
  BarChart3,
  CircleDollarSign,
  ClipboardList,
  Percent,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { cn, formatKzt, pluralRu } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import type { AnalyticsPeriod } from "@/lib/services/analytics";
import type { MasterWorkload } from "@/lib/services/employees";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/ui/kpi-card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrdersTrendChart, type TrendPoint } from "@/features/dashboard/orders-trend-chart";
import {
  LeadSourcesDonutChart,
  StatusDonutChart,
  type LeadSlice,
  type StatusSlice,
} from "@/features/dashboard/dashboard-charts";

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "week", label: "Неделя" },
  { value: "month", label: "Месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

export type AnalyticsPayload = {
  period: AnalyticsPeriod;
  kpis: {
    totalOrders: { value: number; trend: number };
    inProduction: { value: number; trend: number };
    completed: { value: number; trend: number };
    revenue: { value: number; trend: number };
    profit: { value: number; trend: number };
  };
  trend: TrendPoint[];
  statusDistribution: StatusSlice[];
  leadSources: LeadSlice[];
  masters: MasterWorkload[];
  periodFinance: {
    revenue: number;
    profit: number;
    cost: number;
    ordersCount: number;
    averageCheck: number;
  };
  conversion: {
    totalLeads: number;
    closed: number;
    inFunnel: number;
    conversionPercent: number;
  };
  productionStages: { key: string; label: string; count: number }[];
};

type Props = {
  initial: AnalyticsPayload;
};

export function AnalyticsView({ initial }: Props) {
  const [period, setPeriod] = useState<AnalyticsPeriod>(initial.period);
  const [data, setData] = useState<AnalyticsPayload>(initial);
  const [isPending, startTransition] = useTransition();

  function selectPeriod(next: AnalyticsPeriod) {
    if (next === period) return;
    setPeriod(next);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/analytics?period=${next}`);
        if (!res.ok) return;
        const json = (await res.json()) as AnalyticsPayload;
        setData(json);
      } catch {
        /* keep previous */
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Аналитика</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Показатели производства и продаж за выбранный период
          </p>
        </div>
        <div
          role="group"
          aria-label="Период"
          className="flex max-w-full gap-1 scroll-x rounded-md bg-panel-elevated p-1"
        >
          {PERIODS.map((p) => {
            const active = period === p.value;
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={active}
                disabled={isPending && !active}
                onClick={() => selectPeriod(p.value)}
                className={cn(
                  "touch-manipulation min-h-12 shrink-0 rounded-md px-4 text-base transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed active:bg-primary/20",
                  active
                    ? "bg-panel font-medium text-foreground dark:bg-foreground/[0.08]"
                    : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6",
          isPending && "opacity-60 transition-opacity",
        )}
      >
        <KpiCard
          label="Заказы (всего)"
          value={data.kpis.totalOrders.value}
          icon={ClipboardList}
          trend={data.kpis.totalOrders.trend}
          period="к пред. мес."
        />
        <KpiCard
          label="В производстве"
          value={data.kpis.inProduction.value}
          icon={BarChart3}
          trend={data.kpis.inProduction.trend}
          period="к пред. мес."
        />
        <KpiCard
          label="Конверсия"
          value={`${data.conversion.conversionPercent}%`}
          icon={Percent}
        />
        <KpiCard
          label="Средний чек"
          value={formatKzt(data.periodFinance.averageCheck)}
          icon={CircleDollarSign}
        />
        <KpiCard
          label="Выручка периода"
          value={formatKzt(data.periodFinance.revenue)}
          icon={Wallet}
          trend={data.kpis.revenue.trend}
          period="к пред. мес."
        />
        <KpiCard
          label="Прибыль периода"
          value={formatKzt(data.periodFinance.profit)}
          icon={TrendingUp}
          trend={data.kpis.profit.trend}
          period="к пред. мес."
        />
      </div>

      <div
        className={cn(
          "grid gap-4 lg:grid-cols-5",
          isPending && "opacity-60 transition-opacity",
        )}
      >
        <div className="lg:col-span-3">
          <OrdersTrendChart
            key={period}
            initialPeriod={period}
            initialData={data.trend}
            hidePeriodSwitcher
          />
        </div>
        <div className="lg:col-span-2">
          <LeadSourcesDonutChart data={data.leadSources} />
        </div>
      </div>

      <div
        className={cn(
          "grid gap-4 lg:grid-cols-2",
          isPending && "opacity-60 transition-opacity",
        )}
      >
        <StatusDonutChart data={data.statusDistribution} />
        <Card>
          <CardHeader>
            <CardTitle>Производственные этапы</CardTitle>
            <CardDescription>Активные позиции по цеху</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.productionStages.map((s) => (
              <div key={s.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="tabular-nums font-medium">{s.count}</span>
                </div>
                <Progress value={Math.min(100, s.count * 20)} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className={cn(isPending && "opacity-60 transition-opacity")}>
        <CardHeader>
          <CardTitle>Мастера</CardTitle>
          <CardDescription>
            Объективные метрики: заказы, изделия, сроки, просрочки, загрузка
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 md:px-5 md:pb-5">
          {data.masters.length === 0 ? (
            <EmptyState compact title="Нет активных мастеров" />
          ) : (
          <>
          <MobileList inset aria-label="Мастера">
            {data.masters.map((m) => (
              <MobileListItem
                key={m.employee.id}
                title={m.employee.fullName}
                meta={
                  <>
                    {pluralRu(m.activeOrders, ["заказ", "заказа", "заказов"])},{" "}
                    {pluralRu(m.totalUnits, ["изделие", "изделия", "изделий"])}
                    {m.avgDeadlineDays != null && `, в среднем ${m.avgDeadlineDays} дн.`}
                    {m.overdueOrders > 0 && (
                      <span className="text-destructive">, просрочено {m.overdueOrders}</span>
                    )}
                  </>
                }
                value={`${m.loadPercent}%`}
                valueMeta={
                  <Progress
                    value={m.loadPercent}
                    aria-label={`Загрузка ${m.employee.fullName}`}
                    className="h-1 w-16"
                  />
                }
              />
            ))}
          </MobileList>
          <Table className="hidden md:table">
            <TableHeader>
              <TableRow>
                <TableHead>Мастер</TableHead>
                <TableHead className="text-right">Заказы</TableHead>
                <TableHead className="text-right">Изделия</TableHead>
                <TableHead className="text-right">Ср. срок</TableHead>
                <TableHead className="text-right">Просрочка</TableHead>
                <TableHead className="text-right">Загрузка</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.masters.map((m) => (
                  <TableRow key={m.employee.id}>
                    <TableCell className="font-medium">
                      {m.employee.fullName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.activeOrders}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.totalUnits}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.avgDeadlineDays == null ? (
                        <span className="text-muted-foreground">Нет данных</span>
                      ) : (
                        `${m.avgDeadlineDays} дн.`
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        m.overdueOrders > 0 && "text-destructive",
                      )}
                    >
                      {m.overdueOrders}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex min-w-[88px] flex-col items-end gap-1">
                        <span className="tabular-nums text-sm">
                          {m.loadPercent}%
                        </span>
                        <Progress
                          value={m.loadPercent}
                          aria-label={`Загрузка ${m.employee.fullName}`}
                          className="h-1 w-20"
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
          </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Закрыто</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.conversion.closed}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>В воронке</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.conversion.inFunnel}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Заказов за период</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {data.periodFinance.ordersCount}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
