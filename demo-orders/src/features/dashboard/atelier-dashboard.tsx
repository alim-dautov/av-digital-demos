import Link from "next/link";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardList,
  Clock,
  Hourglass,
  Images,
  Scissors,
  TrendingUp,
} from "lucide-react";
import { formatDateRu, formatKzt } from "@/lib/utils";
import { can } from "@/lib/rbac";
import { getAtelierDashboardStats, orderVisibleInList } from "@/lib/services/atelier-orders";
import { listOrders } from "@/lib/services/orders";
import { listClients } from "@/lib/services/clients";
import { getLowStock, getStockSummary } from "@/lib/services/inventory";
import { getAtelierProfit, resolvePeriod } from "@/lib/services/atelier-profit";
import { listWorkshopOrders } from "@/lib/services/workshop";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Card, CardContent } from "@/components/ui/card";
import { OrderStatusBadge } from "@/features/orders/order-status-badge";
import { formatDateTimeRu } from "@/features/orders/status-history";
import { DashboardCardHeader } from "@/features/dashboard/dashboard-card-header";
import type { AtelierOrderStatus, SessionUser } from "@/types";

function WorkshopQueue({ companyId, userId }: { companyId: string; userId: string }) {
  const queue = listWorkshopOrders(companyId).filter(
    (o) => o.status === "awaiting" || (o.status === "in_work" && o.acceptedBy?.userId === userId),
  );
  return (
    <Card className="min-w-0">
      <DashboardCardHeader
        title="Цех"
        description="Ожидают принятия и ваши заказы в работе"
        href="/workshop"
        linkLabel="Открыть"
      />
      <CardContent>
        {queue.length === 0 ? (
          <EmptyState
            compact
            icon={Scissors}
            title="Новых заказов нет"
            description="Когда менеджер передаст заказ в цех, придёт уведомление."
          />
        ) : (
          <ul className="-mx-2 divide-y divide-border">
            {queue.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/workshop?order=${o.number}`}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.04]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      <span className="tabular-nums">№{o.number}</span> · {o.clientName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.status === "awaiting" && o.sewingOrderAt
                        ? `Передан ${formatDateTimeRu(o.sewingOrderAt)}`
                        : `Срок ${formatDateRu(o.deadline)}`}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} textiles />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AtelierDashboard({ user }: { user: SessionUser }) {
  const { companyId } = user;
  const canWorkshop = can(user, "workshop", "read");
  /** Seamstresses read orders without prices, so they get the workshop queue instead. */
  const canOrders =
    can(user, "orders", "write") ||
    (can(user, "orders", "read") && !can(user, "workshop", "write"));
  const canInventory = can(user, "inventory", "read");
  const canCalculator = can(user, "calculator", "write");
  const canGallery = can(user, "gallery", "read");
  const showFinance = can(user, "finance", "read");

  const stats = getAtelierDashboardStats(companyId, user.role);
  const month = showFinance ? getAtelierProfit(companyId, resolvePeriod("month")).totals : null;
  const clientMap = canOrders
    ? new Map(listClients(companyId).map((c) => [c.id, c.fullName]))
    : new Map<string, string>();
  const orders = canOrders
    ? [...listOrders(companyId)]
        .filter((o) => orderVisibleInList(o, user.role))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6)
    : [];
  const stock = canInventory ? getStockSummary(companyId) : null;
  const lowStock = canInventory
    ? getLowStock(companyId).filter(
        (m) => m.category === "fabric_portiere" || m.category === "fabric_tulle",
      )
    : [];

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Шторы Демо · шторы и текстиль</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Здравствуйте, {user.firstName}
          </h1>
        </div>
        {canCalculator && (
          <Button asChild className="self-start sm:self-auto">
            <Link href="/calculator">
              <Calculator aria-hidden />
              Новый расчёт
            </Link>
          </Button>
        )}
      </header>

      {(canOrders || canWorkshop) && (
        <section
          aria-label="Ключевые показатели"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5"
        >
          {canOrders && (
            <KpiCard label="Расчёты" value={String(stats.draft)} icon={ClipboardList} />
          )}
          <KpiCard label="Ожидают принятия" value={String(stats.awaiting)} icon={Hourglass} />
          <KpiCard label="В работе" value={String(stats.inWork)} icon={Clock} />
          <KpiCard label="Завершены" value={String(stats.completed)} icon={CheckCircle2} />
          {canOrders && (
            <KpiCard label="Просрочены" value={String(stats.overdue)} icon={AlertTriangle} />
          )}
        </section>
      )}

      {month && (
        <section aria-label="Финансы за месяц" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Сумма заказов за месяц" value={formatKzt(month.revenue)} icon={TrendingUp} />
          <KpiCard label="Расходы" value={formatKzt(month.expenses)} />
          <KpiCard label="Чистая прибыль" value={formatKzt(month.netProfit)} />
          <KpiCard label="Маржа" value={`${month.marginPercent}%`} />
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        {canWorkshop && !canOrders && <WorkshopQueue companyId={companyId} userId={user.id} />}

        {canOrders && (
          <Card className="min-w-0 lg:col-span-2">
            <DashboardCardHeader title="Последние заказы" description="Новые сверху" href="/orders" />
            <CardContent>
              {orders.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Заказов пока нет"
                  action={
                    canCalculator ? { label: "Открыть калькулятор", href: "/calculator" } : undefined
                  }
                />
              ) : (
                <ul className="-mx-2 divide-y divide-border">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/orders/${o.number}`}
                        className="flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.04]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            <span className="tabular-nums">{o.number}</span> ·{" "}
                            {clientMap.get(o.clientId) ?? "Клиент"}
                          </p>
                          {showFinance && (
                            <p className="text-xs tabular-nums text-muted-foreground">
                              {formatKzt(o.amount)}
                            </p>
                          )}
                        </div>
                        <OrderStatusBadge status={o.status as AtelierOrderStatus} textiles />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {stock && (
          <Card className="min-w-0">
            <DashboardCardHeader
              title="Склад тканей"
              description="Портьера и тюль"
              href="/inventory"
              linkLabel="Открыть"
            />
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-panel-elevated px-3 py-3">
                  <dt className="text-xs text-muted-foreground">Позиций</dt>
                  <dd className="text-lg font-semibold tabular-nums">{stock.totalSkus}</dd>
                </div>
                {showFinance && (
                  <div className="rounded-lg bg-panel-elevated px-3 py-3">
                    <dt className="text-xs text-muted-foreground">По себестоимости</dt>
                    <dd className="truncate text-lg font-semibold tabular-nums">
                      {formatKzt(stock.totalValue)}
                    </dd>
                  </div>
                )}
              </dl>
              {lowStock.length > 0 ? (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Заканчивается</p>
                  <ul className="divide-y divide-border text-sm">
                    {lowStock.slice(0, 5).map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0 truncate">{m.name}</span>
                        <span className="shrink-0 tabular-nums text-warning">
                          {m.quantity} {m.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={CheckCircle2}
                  title="Критичных остатков нет"
                  description="Все ткани выше минимального запаса."
                />
              )}
            </CardContent>
          </Card>
        )}

        {canGallery && !canOrders && (
          <Card className="min-w-0">
            <DashboardCardHeader title="Галерея" description="Фото и видео работ" href="/gallery" linkLabel="Открыть" />
            <CardContent>
              <EmptyState
                compact
                icon={Images}
                title="Загружайте фото и видео готовых работ"
                action={{ label: "Перейти в галерею", href: "/gallery" }}
              />
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
