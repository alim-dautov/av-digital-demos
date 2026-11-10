import Link from "next/link";
import { CircleDollarSign, Percent, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listExpenseCategories } from "@/lib/services/order-expenses";
import {
  getAtelierProfit,
  PERIOD_PRESETS,
  resolvePeriod,
  type PeriodPreset,
} from "@/lib/services/atelier-profit";
import { cn, formatDateRu, formatKzt, pluralRu } from "@/lib/utils";
import { ATELIER_ORDER_STATUS_LABELS } from "@/types";

export function AtelierFinance({
  companyId,
  params,
  canOpenCosting,
  cashRegister,
}: {
  companyId: string;
  params: { period?: string; from?: string; to?: string };
  canOpenCosting: boolean;
  cashRegister?: React.ReactNode;
}) {
  const period = resolvePeriod(params.period, params.from, params.to);
  const { rows, totals } = getAtelierProfit(companyId, period);
  const categories = listExpenseCategories(companyId);
  const categoryLabel = new Map(categories.map((c) => [c.key, c.label]));
  const periodText =
    period.from || period.to
      ? `${period.from ? formatDateRu(period.from) : "…"} — ${period.to ? formatDateRu(period.to) : "…"}`
      : "за всё время";
  const orderHref = (number: string) =>
    canOpenCosting ? `/costing?order=${number}` : `/orders/${number}`;

  return (
    <div className="space-y-6 pb-8">
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">
            {`${periodText}: ${pluralRu(totals.orders, ["заказ", "заказа", "заказов"])}. Чистая прибыль = сумма заказа − все расходы.`}
          </p>
        </div>
        <nav aria-label="Период" className="flex flex-wrap items-end gap-2">
          {(Object.keys(PERIOD_PRESETS) as PeriodPreset[])
            .filter((p) => p !== "custom")
            .map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period.preset === p ? "default" : "outline"}
                asChild
              >
                <Link href={`/finance?period=${p}`}>{PERIOD_PRESETS[p]}</Link>
              </Button>
            ))}
          <form action="/finance" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="period" value="custom" />
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">С</span>
              <Input type="date" name="from" defaultValue={period.from ?? ""} className="h-9 w-40" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              <span className="block">По</span>
              <Input type="date" name="to" defaultValue={period.to ?? ""} className="h-9 w-40" />
            </label>
            <Button
              type="submit"
              size="sm"
              variant={period.preset === "custom" ? "default" : "outline"}
            >
              Показать
            </Button>
          </form>
        </nav>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Сумма заказов" value={formatKzt(totals.revenue)} icon={CircleDollarSign} />
        <KpiCard label="Все расходы" value={formatKzt(totals.expenses)} icon={TrendingDown} />
        <KpiCard
          label="Чистая прибыль"
          value={formatKzt(totals.netProfit)}
          icon={totals.netProfit < 0 ? Wallet : TrendingUp}
        />
        <KpiCard label="Маржа" value={`${totals.marginPercent}%`} icon={Percent} />
      </section>

      {totals.ordersWithoutExpenses > 0 && (
        <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {`У ${pluralRu(totals.ordersWithoutExpenses, ["заказа", "заказов", "заказов"])} расходы не внесены, прибыль по ним завышена.`}
        </p>
      )}

      {cashRegister}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <EmptyState
            icon={Wallet}
            title="Нет заказов за период"
            description="Учитываются заказы, переданные в цех: черновики расчётов и отменённые не входят."
          />
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <h2 className="text-sm font-semibold text-muted-foreground">По заказам</h2>
            <MobileList aria-label="Прибыль по заказам">
              {rows.map((r) => (
                <MobileListItem
                  key={r.orderId}
                  href={r.deleted ? undefined : orderHref(r.number)}
                  title={`№${r.number}, ${r.clientName}`}
                  subtitle={`${formatDateRu(r.date)} · ${r.deleted ? "удалён" : (ATELIER_ORDER_STATUS_LABELS[r.status] ?? r.status)}`}
                  meta={`Сумма ${formatKzt(r.revenue)}, расходы ${r.hasExpenses ? formatKzt(r.expenses) : "не внесены"}`}
                  value={formatKzt(r.netProfit)}
                  valueMeta={`маржа ${r.marginPercent}%`}
                />
              ))}
            </MobileList>
            <div className="hidden overflow-hidden rounded-lg border border-border bg-panel md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Заказ</TableHead>
                    <TableHead>Дата</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">Расходы</TableHead>
                    <TableHead className="text-right">Прибыль</TableHead>
                    <TableHead className="text-right">Маржа</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.orderId}>
                      <TableCell>
                        {r.deleted ? (
                          <span className="font-medium tabular-nums text-muted-foreground">
                            №{r.number}{" "}
                            <Badge variant="outline" className="ml-1 align-middle">
                              удалён
                            </Badge>
                          </span>
                        ) : (
                          <Link
                            href={orderHref(r.number)}
                            className="font-medium tabular-nums text-primary hover:underline"
                          >
                            №{r.number}
                          </Link>
                        )}
                        <span className="block max-w-48 truncate text-xs text-muted-foreground">
                          {r.clientName}
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatDateRu(r.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKzt(r.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.hasExpenses ? (
                          formatKzt(r.expenses)
                        ) : (
                          <span className="text-muted-foreground">не внесены</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium tabular-nums",
                          r.netProfit < 0 && "text-destructive",
                        )}
                      >
                        {formatKzt(r.netProfit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.marginPercent}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Расходы по категориям</CardTitle>
              <CardDescription>Фактические расходы заказов за период</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                {Object.entries(totals.byCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value]) => (
                    <div key={key} className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted-foreground">{categoryLabel.get(key) ?? key}</dt>
                      <dd className="tabular-nums">{formatKzt(value)}</dd>
                    </div>
                  ))}
                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                  <dt className="font-medium">Итого</dt>
                  <dd className="font-semibold tabular-nums">{formatKzt(totals.expenses)}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
