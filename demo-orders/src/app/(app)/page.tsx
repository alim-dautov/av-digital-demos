import { getSession } from "@/lib/auth";
import { can, canSeeFinance } from "@/lib/rbac";
import { isTextilesCompany } from "@/lib/company";
import { AtelierDashboard } from "@/features/dashboard/atelier-dashboard";
import { redirect } from "next/navigation";
import { getNavForUser } from "@/lib/nav";
import Link from "next/link";
import {
  ClipboardList,
  Factory,
  CheckCircle2,
  Wallet,
  TrendingUp,
  AlertTriangle,
  Clock,
  Users,
} from "lucide-react";
import {
  cn,
  formatDateRu,
  formatKzt,
  formatTimeRu,
} from "@/lib/utils";
import {
  getDashboardKpis,
  getOrdersTrend,
  getStatusDistribution,
  getProductionStagesSummary,
  getFinanceSummary,
  getLeadSources,
  getMastersAnalytics,
} from "@/lib/services/analytics";
import { getStockSummary, getLowStock } from "@/lib/services/inventory";
import { listOrders } from "@/lib/services/orders";
import { getTodayTasks } from "@/lib/services/tasks";
import { listEmployees } from "@/lib/services/employees";
import { listAttendance, getLateToday } from "@/lib/services/attendance";
import {
  CATEGORY_LABELS,
  type InventoryCategory,
  type TaskPriority,
} from "@/types";
import { anyOrderStatusLabel } from "@/lib/services/orders";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Progress } from "@/components/ui/progress";
import { VoiceAssistantPanel } from "@/features/voice/voice-assistant-panel";
import { OrdersTrendChart } from "@/features/dashboard/orders-trend-chart";
import {
  StatusDonutChart,
  LeadSourcesDonutChart,
} from "@/features/dashboard/dashboard-charts";
import {
  DashboardCardHeader,
  DashboardCardLink,
} from "@/features/dashboard/dashboard-card-header";

const PRIORITY_VARIANT: Record<
  TaskPriority,
  "secondary" | "default" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "default",
  high: "warning",
  urgent: "destructive",
};

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочно",
};

const ATTENTION_LIMIT = 4;

export default async function HomePage() {
  const session = await getSession();
  if (!session) return null;

  const companyId = session.companyId;
  const firstName = session.firstName;
  const showFinance = canSeeFinance(session);

  if (!can(session, "dashboard", "read")) {
    const vertical = isTextilesCompany(companyId) ? "textiles" : "furniture";
    const first = getNavForUser(session, vertical).find((item) => item.href !== "/");
    if (first) redirect(first.href);
    return (
      <EmptyState
        className="min-h-[50dvh]"
        icon={Users}
        title={`Здравствуйте, ${firstName}`}
        description="Для вашей учётной записи пока не открыт ни один раздел. Обратитесь к администратору."
      />
    );
  }

  if (isTextilesCompany(companyId)) {
    return <AtelierDashboard user={session} />;
  }

  const kpis = getDashboardKpis(companyId);
  const trend = showFinance ? getOrdersTrend(companyId, "month") : [];
  const statusDistribution = getStatusDistribution(companyId);
  const productionStages = getProductionStagesSummary(companyId);
  const finance = showFinance ? getFinanceSummary(companyId) : null;
  const leadSources = showFinance ? getLeadSources(companyId) : [];
  const masters = getMastersAnalytics(companyId);
  const stock = getStockSummary(companyId);
  const lowStock = getLowStock(companyId);
  const recentOrders = [...listOrders(companyId)]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, 6);
  const todayTasks = getTodayTasks(companyId, session.employeeId);
  const employees = listEmployees(companyId);
  const attendance = listAttendance(companyId);
  const lateToday = getLateToday(companyId);

  const employeeMap = new Map(
    employees.map((e) => [e.id, e.fullName] as const),
  );
  const maxStageCount = Math.max(1, ...productionStages.map((s) => s.count));
  const presentCount = attendance.length;
  const activeEmployees = employees.filter((e) => e.status === "active").length;
  const todayLabel = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Almaty",
  }).format(new Date());

  const hasLate = lateToday.length > 0;
  const hasLowStock = lowStock.length > 0;

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground first-letter:uppercase">
            {todayLabel}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Здравствуйте, {firstName}
          </h1>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <li>
            <span className="font-medium tabular-nums text-foreground">
              {kpis.inProduction.value}
            </span>{" "}
            в производстве
          </li>
          <li>
            <span className="font-medium tabular-nums text-foreground">
              {todayTasks.length}
            </span>{" "}
            задач на сегодня
          </li>
          {hasLate && (
            <li className="text-warning">
              <span className="font-medium tabular-nums">{lateToday.length}</span>{" "}
              опоздали
            </li>
          )}
          {stock.lowStockCount > 0 && (
            <li className="text-warning">
              <span className="font-medium tabular-nums">
                {stock.lowStockCount}
              </span>{" "}
              поз. заканчиваются
            </li>
          )}
        </ul>
      </header>

      <section
        aria-label="Ключевые показатели"
        className={cn(
          "grid grid-cols-2 gap-3",
          showFinance ? "lg:grid-cols-5" : "lg:grid-cols-3",
        )}
      >
        <KpiCard
          label="Всего заказов"
          value={kpis.totalOrders.value}
          trend={kpis.totalOrders.trend}
          period="к пред. месяцу"
          icon={ClipboardList}
        />
        <KpiCard
          label="В производстве"
          value={kpis.inProduction.value}
          trend={kpis.inProduction.trend}
          period="к пред. месяцу"
          icon={Factory}
        />
        <KpiCard
          label="Завершено"
          value={kpis.completed.value}
          trend={kpis.completed.trend}
          period="к пред. месяцу"
          icon={CheckCircle2}
        />
        {showFinance && (
          <>
            <KpiCard
              label="Выручка"
              value={formatKzt(kpis.revenue.value)}
              trend={kpis.revenue.trend}
              period="за месяц"
              icon={Wallet}
            />
            <KpiCard
              label="Прибыль"
              value={formatKzt(kpis.profit.value)}
              trend={kpis.profit.trend}
              period="за месяц"
              icon={TrendingUp}
              className="col-span-2 lg:col-span-1"
            />
          </>
        )}
      </section>

      {(hasLate || hasLowStock) && (
        <section aria-labelledby="attention-title">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle id="attention-title" className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                Требует внимания
              </CardTitle>
            </CardHeader>
            <CardContent
              className={cn(
                "grid gap-6",
                hasLate && hasLowStock && "md:grid-cols-2",
              )}
            >
              {hasLate && (
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Опоздали сегодня
                    </p>
                    <DashboardCardLink href="/attendance">
                      Посещаемость
                    </DashboardCardLink>
                  </div>
                  <ul className="divide-y divide-border">
                    {lateToday.slice(0, ATTENTION_LIMIT).map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{a.employeeName}</p>
                          <p className="text-xs tabular-nums text-muted-foreground">
                            {formatTimeRu(a.checkInAt)} · {a.location}
                          </p>
                        </div>
                        <Badge variant="warning" className="tabular-nums">
                          +{a.lateMinutes} мин
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {hasLowStock && (
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Заканчивается на складе
                    </p>
                    <DashboardCardLink href="/inventory">Склад</DashboardCardLink>
                  </div>
                  <ul className="divide-y divide-border">
                    {lowStock.slice(0, ATTENTION_LIMIT).map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3 py-2.5 text-sm"
                      >
                        <p className="min-w-0 truncate font-medium">{m.name}</p>
                        <span className="shrink-0 tabular-nums text-warning">
                          {m.quantity} {m.unit}
                          <span className="ml-1 text-xs text-muted-foreground">
                            / мин. {m.minStock}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {(showFinance || can(session, "assistant", "read")) && (
        <section className="grid gap-4 xl:grid-cols-3">
          {showFinance && (
            <div className="min-w-0 xl:col-span-2">
              <OrdersTrendChart initialPeriod="month" initialData={trend} />
            </div>
          )}
          {can(session, "assistant", "read") && <VoiceAssistantPanel />}
        </section>
      )}

      <section>
        <Card>
          <DashboardCardHeader
            title="Этапы производства"
            description="Активные заказы по стадиям цеха"
            href="/production"
            linkLabel="Производство"
          />
          <CardContent>
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {productionStages.map((stage) => {
                const pct = Math.round((stage.count / maxStageCount) * 100);
                return (
                  <div key={stage.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-muted-foreground">{stage.label}</span>
                      <span className="font-medium tabular-nums">
                        {stage.count}
                      </span>
                    </div>
                    <Progress value={pct} aria-label={stage.label} />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <DashboardCardHeader
            title="Недавние заказы"
            description="Последние по дате"
            href="/orders"
          />
          <CardContent>
            {recentOrders.length === 0 ? (
              <EmptyState
                compact
                icon={ClipboardList}
                title="Заказов пока нет"
                action={{ label: "Создать заказ", href: "/orders/new" }}
              />
            ) : (
              <ul className="-mx-2 divide-y divide-border">
                {recentOrders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/orders/${o.number}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.04]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          <span className="tabular-nums">№{o.number}</span> ·{" "}
                          {o.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateRu(o.date)} ·{" "}
                          {anyOrderStatusLabel(o.status)}
                        </p>
                      </div>
                      {showFinance && (
                        <span className="shrink-0 text-sm font-medium tabular-nums">
                          {formatKzt(o.amount)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <DashboardCardHeader
            title="Задачи на сегодня"
            description={
              todayTasks.length ? `${todayTasks.length} активных` : "На сегодня пусто"
            }
            href="/tasks"
          />
          <CardContent>
            {todayTasks.length === 0 ? (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="На сегодня задач нет"
                action={{ label: "Открыть задачи", href: "/tasks" }}
              />
            ) : (
              <ul className="divide-y divide-border">
                {todayTasks.slice(0, 6).map((t) => (
                  <li
                    key={t.id}
                    className="flex items-start justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.title}</p>
                      {t.description ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {t.description}
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={PRIORITY_VARIANT[t.priority]}>
                      {PRIORITY_LABEL[t.priority]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <StatusDonutChart data={statusDistribution} />

        <Card className="h-full min-w-0">
          <DashboardCardHeader
            title="Сотрудники сегодня"
            description="Присутствие и опоздания"
            href="/employees"
          />
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-3 gap-2">
              {[
                { label: "В штате", value: activeEmployees, icon: Users },
                { label: "На месте", value: presentCount, icon: Clock },
                {
                  label: "Опоздали",
                  value: lateToday.length,
                  icon: AlertTriangle,
                  warn: hasLate,
                },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-panel-elevated px-3 py-3">
                  <dt className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <s.icon className="size-3.5" aria-hidden />
                    {s.label}
                  </dt>
                  <dd
                    className={cn(
                      "text-xl font-semibold tabular-nums",
                      s.warn && "text-warning",
                    )}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>

            {attendance.length === 0 ? (
              <EmptyState
                compact
                icon={Clock}
                title="Пока никто не отметился"
                description="Отметки появятся после сканирования QR-кода."
                action={{ label: "Показать QR-код", href: "/attendance/qr" }}
              />
            ) : (
              <ul className="max-h-[220px] divide-y divide-border overflow-y-auto">
                {attendance.map((a) => {
                  const late = a.lateMinutes > 0;
                  return (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {employeeMap.get(a.employeeId) ?? "Сотрудник"}
                        </p>
                        <p className="truncate text-xs tabular-nums text-muted-foreground">
                          {formatTimeRu(a.checkInAt)} · {a.location}
                        </p>
                      </div>
                      {late ? (
                        <Badge variant="warning" className="tabular-nums">
                          +{a.lateMinutes} мин
                        </Badge>
                      ) : (
                        <Badge variant="success">Вовремя</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="h-full min-w-0">
          <DashboardCardHeader
            title="Склад"
            description="Остатки по категориям"
            href="/inventory"
            linkLabel="Открыть"
          />
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-panel-elevated px-3 py-3">
                <dt className="text-xs text-muted-foreground">SKU</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {stock.totalSkus}
                </dd>
              </div>
              {showFinance && (
                <div className="rounded-lg bg-panel-elevated px-3 py-3">
                  <dt className="text-xs text-muted-foreground">Стоимость</dt>
                  <dd className="truncate text-lg font-semibold tabular-nums">
                    {formatKzt(stock.totalValue)}
                  </dd>
                </div>
              )}
            </dl>
            <ul className="divide-y divide-border text-sm">
              {(Object.keys(stock.byCategory) as InventoryCategory[]).map(
                (cat) => (
                  <li
                    key={cat}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span className="truncate text-muted-foreground">
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {stock.byCategory[cat].count}
                      {showFinance && (
                        <span className="ml-1 text-muted-foreground">
                          · {formatKzt(stock.byCategory[cat].value)}
                        </span>
                      )}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {finance && (
        <Card className="h-full min-w-0">
          <DashboardCardHeader
            title="Финансы за месяц"
            description={
              <>
                <span className="tabular-nums">{finance.ordersCount}</span> заказов · ср. чек{" "}
                <span className="tabular-nums">{formatKzt(finance.averageCheck)}</span>
              </>
            }
            href="/finance"
            linkLabel="Подробнее"
          />
          <CardContent>
            <dl className="divide-y divide-border text-sm">
              {[
                { label: "Выручка", value: finance.revenue, strong: true },
                { label: "Себестоимость", value: finance.cost },
                { label: "Зарплаты", value: finance.salaries },
                { label: "Материалы (склад)", value: finance.materials },
                { label: "Прибыль", value: finance.profit, strong: true },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd
                    className={cn(
                      "tabular-nums",
                      row.strong && "font-semibold text-foreground",
                    )}
                  >
                    {formatKzt(row.value)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        )}

        {showFinance && <LeadSourcesDonutChart data={leadSources} />}

        <Card className="h-full min-w-0">
          <DashboardCardHeader
            title="Загрузка мастеров"
            description="Активные заказы и этапы"
            href="/employees"
          />
          <CardContent>
            {masters.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="Нет активных мастеров"
                action={{ label: "Сотрудники", href: "/employees" }}
              />
            ) : (
              <ul className="space-y-4">
                {masters.map((m) => (
                  <li key={m.employee.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">
                        {m.employee.fullName}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {m.activeOrders} зак. · {m.loadPercent}%
                      </span>
                    </div>
                    <Progress
                      value={m.loadPercent}
                      aria-label={`Загрузка: ${m.employee.fullName}`}
                    />
                    {m.currentStages.length > 0 && (
                      <p className="truncate text-xs text-muted-foreground">
                        {m.currentStages.join(", ")}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
