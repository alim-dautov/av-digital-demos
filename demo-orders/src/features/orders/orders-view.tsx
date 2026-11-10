"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClipboardList, LayoutGrid, List, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDateRu, formatKzt } from "@/lib/utils";
import type { FunnelStage, OrderStatus } from "@/types";
import { ORDER_STATUS_LABELS } from "@/types";
import { OrderStatusBadge } from "@/features/orders/order-status-badge";
import { OrderStatusSelect } from "@/features/orders/order-status-select";
import {
  CreateOrderForm,
  type CreateOrderClientOption,
  type CreateOrderOption,
} from "@/features/orders/create-order-form";

export type OrdersViewItem = {
  id: string;
  number: string;
  status: OrderStatus;
  amount: number;
  deadline: string;
  clientName: string;
  masterName: string | null;
  responsibleName: string | null;
  description: string;
};

type ViewMode = "kanban" | "table" | "list";

const STATUS_ORDER = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

const VIEW_MODES = [
  { id: "kanban", label: "Доска", icon: LayoutGrid },
  { id: "table", label: "Таблица", icon: Table2 },
  { id: "list", label: "Список", icon: List },
] as const;

function OrderRow({ order }: { order: OrdersViewItem }) {
  return (
    <Link
      href={`/orders/${order.number}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 first:rounded-t-lg last:rounded-b-lg hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none"
    >
      <span className="w-14 shrink-0 font-semibold tabular-nums text-primary">
        №{order.number}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {order.clientName}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {order.description}
        </p>
        <p className="mt-1 text-xs tabular-nums text-muted-foreground sm:hidden">
          {formatKzt(order.amount)}, до {formatDateRu(order.deadline)}
        </p>
      </div>
      <OrderStatusBadge status={order.status} className="shrink-0" />
      <span className="hidden w-28 shrink-0 text-right text-sm tabular-nums text-foreground sm:block">
        {formatKzt(order.amount)}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground lg:block">
        {formatDateRu(order.deadline)}
      </span>
    </Link>
  );
}

export function OrdersView({
  orders,
  statusCounts,
  canWrite,
  openCreate,
  clients,
  employees,
  masters,
  funnel,
}: {
  orders: OrdersViewItem[];
  statusCounts: Record<OrderStatus, number>;
  canWrite: boolean;
  openCreate: boolean;
  clients: CreateOrderClientOption[];
  employees: CreateOrderOption[];
  masters: CreateOrderOption[];
  funnel?: FunnelStage[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("kanban");
  const [previousOpenCreate, setPreviousOpenCreate] = useState(openCreate);
  const [createOpen, setCreateOpen] = useState(openCreate);
  if (openCreate !== previousOpenCreate) {
    setPreviousOpenCreate(openCreate);
    setCreateOpen(openCreate);
  }
  const total = orders.length;
  const maxCount = Math.max(1, ...STATUS_ORDER.map((s) => statusCounts[s]));

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(
      STATUS_ORDER.map((s) => [s, [] as OrdersViewItem[]]),
    ) as Record<OrderStatus, OrdersViewItem[]>;
    for (const o of orders) map[o.status].push(o);
    return map;
  }, [orders]);

  function closeCreate() {
    setCreateOpen(false);
    router.replace("/orders", { scroll: false });
  }

  function openCreateUi() {
    setCreateOpen(true);
    router.replace("/orders?new=1", { scroll: false });
  }

  const form = (
    <CreateOrderForm
      clients={clients}
      employees={employees}
      masters={masters}
      funnel={funnel}
      onSuccess={() => setCreateOpen(false)}
    />
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Заказы
          </h1>
          <p className="text-sm text-muted-foreground">
            В воронке:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {total}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Вид"
            className="inline-flex gap-0.5 rounded-md bg-panel-elevated p-0.5"
          >
            {VIEW_MODES.map(({ id, label, icon: Icon }) => {
              const active = view === id;
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(id)}
                  className={cn(
                    "touch-manipulation inline-flex min-h-12 items-center gap-1.5 rounded-md px-3 text-base font-medium transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-primary/20",
                    active
                      ? "bg-panel text-foreground dark:bg-foreground/[0.08]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              );
            })}
          </div>
          {canWrite && (
            <Button onClick={openCreateUi}>
              <Plus className="size-4" aria-hidden />
              Создать заказ
            </Button>
          )}
        </div>
      </header>

      <section
        aria-labelledby="funnel-title"
        className="rounded-lg border border-border bg-panel p-4 sm:p-5"
      >
        <h2
          id="funnel-title"
          className="mb-3 text-sm font-medium text-muted-foreground"
        >
          Воронка
        </h2>
        <ul className="flex gap-2 overflow-x-auto overscroll-x-contain pb-1">
          {STATUS_ORDER.map((status) => {
            const count = statusCounts[status];
            const height = Math.max(12, Math.round((count / maxCount) * 56));
            return (
              <li
                key={status}
                className="flex min-w-[92px] flex-1 flex-col items-center gap-2"
                aria-label={`${ORDER_STATUS_LABELS[status]}: ${count}`}
              >
                <span className="tabular-nums text-sm font-semibold text-foreground">
                  {count}
                </span>
                <div className="flex h-14 w-full items-end justify-center" aria-hidden>
                  <div
                    className={cn(
                      "w-full max-w-10 rounded-t-sm",
                      count > 0 ? "bg-primary/80" : "bg-foreground/[0.08]",
                    )}
                    style={{ height }}
                  />
                </div>
                <span className="line-clamp-2 max-w-full hyphens-auto break-words text-center text-xs leading-tight text-muted-foreground">
                  {ORDER_STATUS_LABELS[status]}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {view === "kanban" && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {STATUS_ORDER.map((status) => (
            <div
              key={status}
              className="flex w-[280px] shrink-0 flex-col rounded-lg border border-border bg-panel"
            >
              <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
                <h2 className="text-sm font-medium text-foreground">
                  {ORDER_STATUS_LABELS[status]}
                </h2>
                <span className="rounded-sm bg-panel-elevated px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {byStatus[status].length}
                </span>
              </div>
              <div className="flex max-h-[calc(100dvh-22rem)] flex-col gap-2 overflow-y-auto p-2">
                {byStatus[status].length === 0 && (
                  <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                    Нет заказов
                  </p>
                )}
                {byStatus[status].map((order) => (
                  <article
                    key={order.id}
                    className="rounded-lg bg-panel-elevated p-3"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <Link
                        href={`/orders/${order.number}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        №{order.number}
                      </Link>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        до {formatDateRu(order.deadline)}
                      </span>
                    </div>
                    <p className="mb-1 truncate text-sm font-medium text-foreground">
                      {order.clientName}
                    </p>
                    <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">
                      {order.description}
                    </p>
                    <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium tabular-nums text-foreground">
                        {formatKzt(order.amount)}
                      </span>
                      <span className="truncate text-muted-foreground">
                        {order.masterName ?? "Без мастера"}
                      </span>
                    </div>
                    {canWrite && (
                      <OrderStatusSelect
                        orderId={order.id}
                        status={order.status}
                        size="sm"
                        aria-label={`Статус заказа №${order.number}`}
                      />
                    )}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "table" && orders.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border bg-panel md:hidden">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}

      {view === "table" && (
        <div
          className={cn(
            "overflow-x-auto rounded-lg border border-border bg-panel",
            orders.length > 0 && "hidden md:block",
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>№</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Сумма</TableHead>
                <TableHead>Мастер</TableHead>
                <TableHead>Дедлайн</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Действия</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="p-0">
                    <EmptyState
                      icon={ClipboardList}
                      title="Заказов пока нет"
                      description="Новые заявки появятся здесь после создания."
                      action={
                        canWrite
                          ? { label: "Создать заказ", onClick: openCreateUi }
                          : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              )}
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${order.number}`}
                      className="font-medium tabular-nums text-primary hover:underline"
                    >
                      №{order.number}
                    </Link>
                  </TableCell>
                  <TableCell>{order.clientName}</TableCell>
                  <TableCell>
                    {canWrite ? (
                      <OrderStatusSelect
                        orderId={order.id}
                        status={order.status}
                        size="sm"
                        aria-label={`Статус заказа №${order.number}`}
                        className="min-w-[140px]"
                      />
                    ) : (
                      <OrderStatusBadge status={order.status} />
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKzt(order.amount)}
                  </TableCell>
                  <TableCell
                    className={cn(!order.masterName && "text-muted-foreground")}
                  >
                    {order.masterName ?? "Не назначен"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDateRu(order.deadline)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/orders/${order.number}`}>Открыть</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {view === "list" && (
        <div className="divide-y divide-border rounded-lg border border-border bg-panel">
          {orders.length === 0 && (
            <EmptyState
              icon={ClipboardList}
              title="Заказов пока нет"
              description="Новые заявки появятся здесь после создания."
              action={
                canWrite
                  ? { label: "Создать заказ", onClick: openCreateUi }
                  : undefined
              }
            />
          )}
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </div>
      )}

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeCreate();
          else setCreateOpen(true);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>Новый заказ</SheetTitle>
            <SheetDescription>
              Заполните карточку, и заказ появится в воронке.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">{form}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
