"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ClipboardList, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDateRu, formatKzt, todayDate } from "@/lib/utils";
import type { AtelierOrderStatus } from "@/types";
import { ATELIER_ORDER_STATUS_LABELS } from "@/types";
import { DeleteOrderDialog, type DeletableOrder } from "@/features/orders/delete-order-dialog";
import { OrderStatusBadge } from "@/features/orders/order-status-badge";
import { OrderStatusSelect } from "@/features/orders/order-status-select";

export type AtelierOrdersItem = {
  id: string;
  number: string;
  status: AtelierOrderStatus;
  amount: number;
  prepayment: number;
  paid: number;
  balance: number;
  active: boolean;
  date: string;
  deadline: string;
  clientName: string;
  responsibleName: string | null;
  description: string;
};

type SortKey = "deadline" | "date" | "amount" | "status";

function deadlineMeta(deadline: string, status: AtelierOrderStatus) {
  if (status === "completed" || status === "cancelled") {
    return null;
  }
  const today = todayDate();
  const d0 = new Date(today + "T12:00:00");
  const d1 = new Date(deadline + "T12:00:00");
  const diff = Math.round((d1.getTime() - d0.getTime()) / 86400000);
  if (diff < 0)
    return { label: "Просрочен", className: "text-destructive font-medium" };
  if (diff === 0)
    return { label: "Сегодня", className: "text-warning font-medium" };
  if (diff === 1)
    return { label: "Завтра", className: "text-warning font-medium" };
  return {
    label: `Через ${diff} дн.`,
    className: "text-muted-foreground",
  };
}

export function AtelierOrdersView({
  orders,
  canWrite,
  canDelete = false,
  hideMoney = false,
  title = "Заказы",
}: {
  orders: AtelierOrdersItem[];
  canWrite: boolean;
  canDelete?: boolean;
  hideMoney?: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("deadline");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeletableOrder | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const visible = useMemo(
    () => orders.filter((o) => !removedIds.has(o.id)),
    [orders, removedIds],
  );

  const filtered = useMemo(() => {
    let list = [...visible];
    if (statusFilter !== "all") {
      list = list.filter((o) => o.status === statusFilter);
    }
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter(
        (o) =>
          o.number.toLowerCase().includes(s) ||
          o.clientName.toLowerCase().includes(s) ||
          o.description.toLowerCase().includes(s),
      );
    }
    list.sort((a, b) => {
      if (sort === "amount") return b.amount - a.amount;
      if (sort === "date") return a.date < b.date ? 1 : -1;
      if (sort === "status") return a.status.localeCompare(b.status);
      return a.deadline.localeCompare(b.deadline);
    });
    return list;
  }, [visible, sort, statusFilter, q]);

  const columns = (hideMoney ? 6 : 9) + (canDelete ? 1 : 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Всего:{" "}
            <span className="font-medium tabular-nums text-foreground">
              {visible.length}
            </span>
          </p>
        </div>
        {canWrite && (
          <Button asChild>
            <Link href="/calculator">Новый расчёт</Link>
          </Button>
        )}
      </header>

      <div className="grid gap-2 sm:flex sm:flex-wrap">
        <div className="relative sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Поиск по заказам"
            placeholder="Клиент, номер или описание"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-[180px]" aria-label="Статус">
            <SelectValue placeholder="Статус" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Все статусы</SelectItem>
            {Object.entries(ATELIER_ORDER_STATUS_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="sm:w-[180px]" aria-label="Сортировка">
            <SelectValue placeholder="Сортировка" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="deadline">По дедлайну</SelectItem>
            <SelectItem value="date">По дате</SelectItem>
            <SelectItem value="amount">По сумме</SelectItem>
            <SelectItem value="status">По статусу</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-panel md:hidden">
          {filtered.map((o) => {
            const dl = deadlineMeta(o.deadline, o.status);
            return (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.number}`}
                  className="flex items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="flex items-baseline gap-2 text-sm">
                      <span className="font-semibold tabular-nums text-primary">
                        №{o.number}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {o.clientName}
                      </span>
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {hideMoney
                        ? `до ${formatDateRu(o.deadline)}`
                        : o.active
                          ? `${formatKzt(o.amount)} · предоплата ${formatKzt(o.prepayment)} · остаток ${formatKzt(o.balance)}`
                          : formatKzt(o.amount)}
                      {hideMoney ? "" : `, до ${formatDateRu(o.deadline)}`}
                      {dl && (
                        <span className={cn("ml-1.5", dl.className)}>
                          {dl.label}
                        </span>
                      )}
                    </p>
                  </div>
                  <OrderStatusBadge status={o.status} textiles className="shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div
        className={cn(
          "overflow-x-auto rounded-lg border border-border bg-panel",
          filtered.length > 0 && "hidden md:block",
        )}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Клиент</TableHead>
              <TableHead>Создан</TableHead>
              <TableHead>Дедлайн</TableHead>
              {!hideMoney && <TableHead className="text-right">Сумма</TableHead>}
              {!hideMoney && <TableHead className="text-right">Предоплата</TableHead>}
              {!hideMoney && <TableHead className="text-right">Остаток</TableHead>}
              <TableHead>Статус</TableHead>
              <TableHead>Ответственный</TableHead>
              {canDelete && (
                <TableHead className="w-12">
                  <span className="sr-only">Действия</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => {
              const dl = deadlineMeta(o.deadline, o.status);
              return (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${o.number}`}
                      className="font-medium tabular-nums text-primary hover:underline"
                    >
                      №{o.number}
                    </Link>
                  </TableCell>
                  <TableCell>{o.clientName}</TableCell>
                  <TableCell className="tabular-nums">{formatDateRu(o.date)}</TableCell>
                  <TableCell>
                    <p className="tabular-nums">{formatDateRu(o.deadline)}</p>
                    {dl && <p className={cn("text-xs", dl.className)}>{dl.label}</p>}
                  </TableCell>
                  {!hideMoney && (
                    <TableCell className="text-right tabular-nums">
                      {formatKzt(o.amount)}
                    </TableCell>
                  )}
                  {!hideMoney && (
                    <TableCell className="text-right tabular-nums">
                      {o.active ? formatKzt(o.prepayment) : "—"}
                    </TableCell>
                  )}
                  {!hideMoney && (
                    <TableCell className="text-right tabular-nums">
                      {o.active ? formatKzt(o.balance) : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    {canWrite ? (
                      <OrderStatusSelect
                        orderId={o.id}
                        status={o.status}
                        textiles
                        size="sm"
                        aria-label={`Статус заказа №${o.number}`}
                      />
                    ) : (
                      <OrderStatusBadge status={o.status} textiles />
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(!o.responsibleName && "text-muted-foreground")}
                  >
                    {o.responsibleName ?? "Не назначен"}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="py-1 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-10 text-muted-foreground [@media(hover:hover)]:hover:text-destructive"
                        aria-label={`Удалить заказ №${o.number}`}
                        title="Удалить заказ"
                        onClick={() => {
                          setDeleteTarget({ id: o.id, number: o.number });
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns} className="p-0">
                  <EmptyState
                    icon={ClipboardList}
                    title="Заказов не найдено"
                    description={
                      canWrite
                        ? "Измените фильтр или создайте расчёт в калькуляторе."
                        : "Измените поиск или фильтр по статусу."
                    }
                    action={
                      canWrite
                        ? { label: "Открыть калькулятор", href: "/calculator" }
                        : undefined
                    }
                  />
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {canDelete && (
        <DeleteOrderDialog
          order={deleteTarget}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={(order) => {
            setRemovedIds((prev) => new Set(prev).add(order.id));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
