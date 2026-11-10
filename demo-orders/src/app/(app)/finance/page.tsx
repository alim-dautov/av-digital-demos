import {
  CircleDollarSign,
  TrendingDown,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CashRegister } from "@/features/finance/cash-register";
import { getSession } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { can, canSeeFinance } from "@/lib/rbac";
import { cashBalance, listCashEntries } from "@/lib/services/cash";
import { AtelierFinance } from "@/features/finance/atelier-finance";
import {
  getDashboardKpis,
  getFinanceSummary,
  getOrdersTrend,
} from "@/lib/services/analytics";
import { formatKzt, pluralRu } from "@/lib/utils";
import { KpiCard } from "@/components/ui/kpi-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FinanceChart } from "@/features/finance/finance-chart";

function BreakdownRow({
  label,
  value,
  percent,
  accent = false,
}: {
  label: string;
  value: string;
  percent: number;
  accent?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <dt className={accent ? "font-medium text-foreground" : "text-muted-foreground"}>
          {label}
        </dt>
        <dd className={accent ? "font-semibold tabular-nums text-primary" : "tabular-nums"}>
          {value}
        </dd>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
        <div
          className={accent ? "h-full rounded-full bg-primary" : "h-full rounded-full bg-foreground/30"}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  const textiles = isTextilesCompany(session.companyId);

  if (textiles ? !can(session, "finance", "read") : !canSeeFinance(session)) {
    return (
      <div>
        <h1 className="sr-only">Финансы</h1>
        <EmptyState
          className="min-h-[50dvh]"
          icon={ShieldAlert}
          title="Нет доступа к финансам"
          description="Раздел доступен владельцу, директору и сотрудникам с правом просмотра зарплат."
          action={{ label: "На главную", href: "/" }}
        />
      </div>
    );
  }

  if (textiles) {
    return (
      <AtelierFinance
        companyId={session.companyId}
        params={await searchParams}
        canOpenCosting={can(session, "costing", "read")}
        cashRegister={
          <CashRegister
            entries={listCashEntries(session.companyId)}
            balance={cashBalance(session.companyId)}
            canWrite={can(session, "finance", "write")}
          />
        }
      />
    );
  }

  const companyId = session.companyId;
  const finance = getFinanceSummary(companyId);
  const kpis = getDashboardKpis(companyId);
  const trend = getOrdersTrend(companyId, "month");
  const chartData = trend.map((p) => ({
    label: p.label,
    revenue: p.revenue,
    profit: p.profit,
    expenses: Math.max(0, p.revenue - p.profit),
  }));

  const expenseRows = [
    { label: "Себестоимость", value: finance.cost },
    { label: "Зарплаты", value: finance.salaries },
    { label: "Авансы", value: finance.advances },
    { label: "Прочие", value: finance.other },
  ];
  const scale = Math.max(finance.revenue, finance.expenses, 1);
  const share = (value: number) => Math.round((value / scale) * 100);

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
          {`Текущий месяц: ${pluralRu(finance.ordersCount, ["заказ", "заказа", "заказов"])}, средний чек ${formatKzt(finance.averageCheck)}`}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Доходы"
          value={formatKzt(finance.revenue)}
          icon={CircleDollarSign}
          trend={kpis.revenue.trend}
          period="к прошлому месяцу"
        />
        <KpiCard
          label="Расходы"
          value={formatKzt(finance.expenses)}
          icon={TrendingDown}
          period="себестоимость, ФОТ, авансы и прочие"
        />
        <KpiCard
          label="Прибыль"
          value={formatKzt(finance.profit)}
          icon={TrendingUp}
          trend={kpis.profit.trend}
          period="к прошлому месяцу"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <FinanceChart data={chartData} />
        </div>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Структура</CardTitle>
            <CardDescription>Из чего складываются расходы месяца</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="space-y-3 text-sm">
              <BreakdownRow
                label="Выручка"
                value={formatKzt(finance.revenue)}
                percent={share(finance.revenue)}
                accent
              />
              {expenseRows.map((row) => (
                <BreakdownRow
                  key={row.label}
                  label={row.label}
                  value={formatKzt(row.value)}
                  percent={share(row.value)}
                />
              ))}
            </dl>

            <dl className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font-medium">Итого расходов</dt>
                <dd className="font-semibold tabular-nums">{formatKzt(finance.expenses)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  Материалы на складе
                  <span className="block text-xs">стоимость остатков, в расходы не входит</span>
                </dt>
                <dd className="tabular-nums text-muted-foreground">
                  {formatKzt(finance.materials)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  Выплачено зарплат за месяц
                  <span className="block text-xs">фактические выплаты, уже учтены в начислениях</span>
                </dt>
                <dd className="tabular-nums text-muted-foreground">
                  {formatKzt(finance.salaryPaidMonth)}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </section>

      {can(session, "finance", "read") && (
        <CashRegister
          entries={listCashEntries(companyId)}
          balance={cashBalance(companyId)}
          canWrite={can(session, "finance", "write")}
        />
      )}
    </div>
  );
}
