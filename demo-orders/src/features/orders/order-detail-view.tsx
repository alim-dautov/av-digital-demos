"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  FileText,
  History,
  ListChecks,
  ListTodo,
  Factory,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteOrderDialog } from "@/features/orders/delete-order-dialog";
import { EditOrderDialog } from "@/features/orders/edit-order-dialog";
import { OrderMoneyPanel } from "@/features/orders/order-money-panel";
import { formatDateTimeRu, StatusHistory } from "@/features/orders/status-history";
import { OrderStatusBadge } from "@/features/orders/order-status-badge";
import { OrderStatusSelect } from "@/features/orders/order-status-select";
import { FilesAndNotes } from "@/features/shared/files-and-notes";
import { ProductionOperationsEditor } from "@/features/workshop/production-editor";
import { normalizeAtelierQuote } from "@/lib/domain/atelier-calc";
import { findRenovationItemLabel, getRenovationBlock } from "@/lib/domain/renovation/catalog";
import {
  enabledRenovationItems,
  normalizeRenovationQuote,
} from "@/lib/domain/renovation/quote";
import { cn, formatDateRu, formatKzt, formatTimeRu } from "@/lib/utils";
import { normalizeVisibility } from "@/lib/order-visibility";
import { WorkerVisibilityFields } from "./worker-visibility-fields";
import type {
  OrderWorkerVisibility,
  ActivityLog,
  ChecklistItem,
  Client,
  EmployeeReport,
  Order,
  OrderStage,
  StageStatus,
  Task,
  TaskPriority,
} from "@/types";
import {
  ORDER_STATUS_LABELS,
  ATELIER_ORDER_STATUS_LABELS,
  SOURCE_LABELS,
} from "@/types";

export type OrderDetailPayload = Order & {
  masterOptions: { id: string; fullName: string }[];
  masterNames: string;
  client: Client | null;
  master: { id: string; fullName: string } | null;
  responsibleName: string | null;
  stages: OrderStage[];
  checklist: ChecklistItem[];
  tasks: Task[];
  reports: (EmployeeReport & { employeeName: string })[];
  history: ActivityLog[];
  audit: import("@/types").OrderAuditLog[];
};

const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  pending: "Ожидает",
  in_progress: "В работе",
  done: "Готово",
  blocked: "Заблокирован",
};

const STAGE_STATUS_VARIANT: Record<
  StageStatus,
  "default" | "secondary" | "success" | "destructive"
> = {
  pending: "secondary",
  in_progress: "default",
  done: "success",
  blocked: "destructive",
};

const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Низкий",
  medium: "Средний",
  high: "Высокий",
  urgent: "Срочный",
};

const TASK_PRIORITY_VARIANT: Record<
  TaskPriority,
  "secondary" | "outline" | "warning" | "destructive"
> = {
  low: "secondary",
  medium: "outline",
  high: "warning",
  urgent: "destructive",
};

const NOT_ASSIGNED = "Не назначен";

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  done: "Готово",
  overdue: "Просрочено",
};

export function OrderDetailView({
  order,
  canWrite,
  canToggleChecklist,
  canSeeFinance,
  initialTab = "overview",
  textiles = false,
  canSeeCosting = false,
  hidePrices = false,
  canDelete = false,
  canEdit = false,
  workerView = null,
  canEditVisibility = false,
  canEditProduction = false,
  canViewProductionAudit = false,
  productionDraftScope,
}: {
  order: OrderDetailPayload;
  canWrite: boolean;
  canDelete?: boolean;
  canEdit?: boolean;
  canEditProduction?: boolean;
  canViewProductionAudit?: boolean;
  productionDraftScope?: string;
  canToggleChecklist: boolean;
  canSeeFinance: boolean;
  initialTab?: string;
  textiles?: boolean;
  canSeeCosting?: boolean;
  hidePrices?: boolean;
  /** Режим рабочего: что показывать по галочкам заказа и его доля. */
  workerView?: {
    visibility: OrderWorkerVisibility;
    share: { percent: number; amount: number } | null;
  } | null;
  canEditVisibility?: boolean;
}) {
  const wv = workerView?.visibility ?? null;
  const showTab = (key: string) => {
    if (!wv) return true;
    if (key === "client") return wv.clientName || wv.clientPhone || wv.address;
    if (key === "production") return wv.stages;
    if (key === "materials" || key === "checklist") return wv.materials;
    if (key === "media") return wv.media;
    if (key === "history") return false;
    return true;
  };
  const router = useRouter();
  const [checklist, setChecklist] = useState(order.checklist);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState(initialTab);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const atelierQuote = useMemo(
    () => (order.atelierQuote ? normalizeAtelierQuote(order.atelierQuote) : null),
    [order.atelierQuote],
  );
  const roomNames = useMemo(
    () => new Map((atelierQuote?.rooms ?? []).map((r) => [r.id, r.name.trim() || "Без названия"])),
    [atelierQuote],
  );

  const progress = useMemo(() => {
    if (!checklist.length) return 0;
    const done = checklist.filter((c) => c.done).length;
    return Math.round((done / checklist.length) * 100);
  }, [checklist]);

  async function toggleItem(item: ChecklistItem) {
    if (!canToggleChecklist) return;
    const next = !item.done;
    setPendingId(item.id);
    setChecklist((prev) =>
      prev.map((c) => (c.id === item.id ? { ...c, done: next } : c)),
    );
    try {
      const res = await fetch(
        `/api/orders/${order.id}/checklist/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ done: next }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChecklist((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)),
        );
        toast.error(data.error ?? "Не удалось обновить");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setChecklist((prev) =>
        prev.map((c) => (c.id === item.id ? { ...c, done: item.done } : c)),
      );
      toast.error("Ошибка сети");
    } finally {
      setPendingId(null);
    }
  }

  const doneCount = checklist.filter((c) => c.done).length;
  const statusLabel =
    (textiles
      ? ATELIER_ORDER_STATUS_LABELS[order.status as keyof typeof ATELIER_ORDER_STATUS_LABELS]
      : ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS]) ??
    order.status;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
          <Link href="/orders">
            <ArrowLeft className="size-4" aria-hidden />
            К заказам
          </Link>
        </Button>

        <header className="flex flex-col gap-5 rounded-lg border border-border bg-panel p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-3xl">
                  Заказ №{order.number}
                </h1>
                <OrderStatusBadge status={order.status} textiles={textiles} />
              </div>
              <p className="text-sm text-muted-foreground">
                {order.client?.fullName ?? (wv ? "Клиент скрыт" : "Клиент не указан")}
                {!wv && <>, источник: {SOURCE_LABELS[order.source]}</>}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
              {(!hidePrices || (wv?.amount ?? false)) && (
                <HeaderStat label="Сумма" value={formatKzt(order.amount)} strong numeric />
              )}
              {workerView?.share && (
                <HeaderStat
                  label={`Ваша доля (${workerView.share.percent}%)`}
                  value={formatKzt(workerView.share.amount)}
                  strong
                  numeric
                />
              )}
              {(!wv || wv.deadline) && (
                <><HeaderStat label="Дедлайн" value={formatDateRu(order.deadline)} numeric />
                <HeaderStat label="Дата закрытия объекта" value={order.closedAt ? formatDateRu(order.closedAt) : null} numeric /></>
              )}
              {atelierQuote?.measurementDate && (
                <HeaderStat
                  label="Дата замера"
                  value={formatDateRu(atelierQuote.measurementDate)}
                  numeric
                />
              )}
              <HeaderStat label="Ответственный" value={order.responsibleName} />
              {textiles ? (
                <HeaderStat
                  label="Швея"
                  value={
                    order.acceptedBy
                      ? `${order.acceptedBy.name}${order.acceptedAt ? `, ${formatDateTimeRu(order.acceptedAt)}` : ""}`
                      : null
                  }
                />
              ) : (
                <HeaderStat label="Мастера" value={order.masterNames || null} />
              )}
            </dl>
          </div>
          {(canWrite || canDelete || canEdit) && (
            <div className="w-full space-y-3 lg:max-w-xs">
              {canWrite && (
                <div className="space-y-2">
                  <Label htmlFor="order-status">Статус</Label>
                  <OrderStatusSelect
                    id="order-status"
                    orderId={order.id}
                    status={order.status}
                    textiles={textiles}
                    disabled={!canWrite}
                  />
                </div>
              )}
              {canEdit && (
                <Button
                  type="button"
                  size="lg"
                  className="h-12 w-full text-base"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-4" aria-hidden />
                  Изменить заказ
                </Button>
              )}
              {canDelete && (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 w-full text-base text-destructive [@media(hover:hover)]:hover:border-destructive/40 [@media(hover:hover)]:hover:text-destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Удалить заказ
                </Button>
              )}
            </div>
          )}
        </header>
        {canEdit && (
          <EditOrderDialog
            order={order}
            open={editOpen}
            onOpenChange={setEditOpen}
            showMoney={!hidePrices}
            onSaved={() => router.refresh()}
          />
        )}
        {canDelete && (
          <DeleteOrderDialog
            order={{ id: order.id, number: order.number }}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => {
              router.push("/orders");
              router.refresh();
            }}
          />
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="-mx-4 flex h-auto w-[calc(100%+2rem)] justify-start scroll-x rounded-none bg-transparent px-4 sm:mx-0 sm:w-fit sm:max-w-full sm:rounded-md sm:bg-panel-elevated sm:px-1">
          <TabsTrigger value="overview">Обзор</TabsTrigger>
          {showTab("client") && (
            <TabsTrigger value="client">Клиент</TabsTrigger>
          )}
          {showTab("production") && (
            <TabsTrigger value="production">Производство</TabsTrigger>
          )}
          {showTab("checklist") && (
            <TabsTrigger value="checklist">Чек-лист</TabsTrigger>
          )}
          {showTab("materials") && (
            <TabsTrigger value="materials">Материалы</TabsTrigger>
          )}
          {canSeeFinance && <TabsTrigger value="finance">Финансы</TabsTrigger>}
          <TabsTrigger value="tasks">Задачи</TabsTrigger>
          <TabsTrigger value="reports">Отчёты</TabsTrigger>
          {showTab("media") && (
            <TabsTrigger value="media">Файлы</TabsTrigger>
          )}
          {showTab("history") && (
            <TabsTrigger value="history">История</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {canEditVisibility && !wv && (
            <VisibilityEditor
              orderId={order.id}
              initial={normalizeVisibility(order.workerVisibility)}
            />
          )}
          <Card>
            <CardHeader>
              <CardTitle>Описание</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-foreground whitespace-pre-wrap">
                {order.description}
              </p>
              {order.comment && (
                <>
                  <Separator />
                  <Meta label="Комментарий" value={order.comment} />
                </>
              )}
              <Separator />
              <dl className="grid gap-3 sm:grid-cols-3">
                <Meta label="Дата" value={formatDateRu(order.date)} />
                {!textiles && !order.renovationQuote && (
                  <Meta
                    label="Единиц мебели"
                    value={String(order.furnitureUnits)}
                  />
                )}
                <Meta
                  label="Чек-лист"
                  value={`${doneCount} из ${checklist.length}, ${progress}%`}
                />
              </dl>
              {textiles && order.atelierQuote && (
                <div className="space-y-4 rounded-lg bg-panel-elevated p-4">
                  <p className="text-sm font-semibold text-foreground">Калькуляция</p>
                  {!hidePrices && (
                  <dl className="grid gap-3 sm:grid-cols-4">
                    <Meta
                      label={
                        order.atelierQuote.discountPercent > 0
                          ? `Итого, скидка ${order.atelierQuote.discountPercent}%`
                          : "Итого"
                      }
                      value={formatKzt(order.atelierQuote.total)}
                      numeric
                    />
                    {canSeeCosting && (
                      <>
                        <Meta
                          label="Себестоимость"
                          value={formatKzt(order.atelierQuote.totalCost)}
                          numeric
                        />
                        <Meta
                          label="Прибыль"
                          value={formatKzt(order.atelierQuote.grossProfit)}
                          numeric
                        />
                        <Meta
                          label="Маржа"
                          value={`${order.atelierQuote.marginPercent}%`}
                          numeric
                        />
                      </>
                    )}
                  </dl>
                  )}
                  {atelierQuote && atelierQuote.rooms.length > 0 && (
                    <ul className="divide-y divide-border rounded-md border border-border text-sm">
                      {atelierQuote.rooms.map((r) => (
                        <li key={r.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                          <span className="truncate">{r.name.trim() || "Без названия"}</span>
                          {!hidePrices && (
                            <span className="tabular-nums text-muted-foreground">
                              {formatKzt(r.subtotal)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/orders/${order.number}/workshop`}>Заказ в цех на пошив</Link>
                    </Button>
                    {!hidePrices && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/orders/${order.number}/measure`}>Лист замера</Link>
                      </Button>
                    )}
                    {!hidePrices && order.proposalId && (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/proposals/${order.proposalId}`}>
                          <FileText className="size-4" aria-hidden />
                          Последнее КП
                        </Link>
                      </Button>
                    )}
                    {!hidePrices && (
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/calculator?order=${order.id}`}>Открыть в калькуляторе</Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}
              {!textiles && order.furnitureQuote && (
                <div className="space-y-4 rounded-lg bg-panel-elevated p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Калькуляция · {order.furnitureQuote.projectName || "мебель"}
                  </p>
                  <dl className="grid gap-3 sm:grid-cols-4">
                    <Meta
                      label={
                        order.furnitureQuote.discountPercent > 0
                          ? `Итого, скидка ${order.furnitureQuote.discountPercent}%`
                          : "Итого"
                      }
                      value={formatKzt(order.furnitureQuote.total)}
                      numeric
                    />
                    <Meta
                      label="Листов ЛДСП"
                      value={String(
                        Object.values(order.furnitureQuote.result?.nestedSheetCounts ?? {}).reduce(
                          (s, n) => s + n,
                          0,
                        ),
                      )}
                      numeric
                    />
                    {canSeeCosting && (
                      <>
                        <Meta
                          label="Себестоимость"
                          value={formatKzt(order.furnitureQuote.totalCost)}
                          numeric
                        />
                        <Meta
                          label="Маржа"
                          value={`${order.furnitureQuote.marginPercent}%`}
                          numeric
                        />
                      </>
                    )}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {order.proposalId && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/calculator/proposal/${order.proposalId}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="size-4" aria-hidden />
                          КП в PDF
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/calculator?order=${order.id}`}>Открыть в калькуляторе</Link>
                    </Button>
                  </div>
                </div>
              )}
              {!textiles && order.renovationQuote && (() => {
                const reno = normalizeRenovationQuote(order.renovationQuote);
                const renoItems = enabledRenovationItems(reno);
                return (
                <div className="space-y-4 rounded-lg bg-panel-elevated p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Калькуляция · {reno.projectName || "ремонт"}
                  </p>
                  {!hidePrices && (
                    <dl className="grid gap-3 sm:grid-cols-3">
                      <Meta
                        label="Итого"
                        value={formatKzt(reno.total)}
                        numeric
                      />
                      <Meta
                        label="Пунктов"
                        value={String(renoItems.length)}
                        numeric
                      />
                    </dl>
                  )}
                  {!hidePrices && (
                    <ul className="divide-y divide-border rounded-md border border-border text-sm">
                      {renoItems.map(({ blockId, item }) => (
                        <li
                          key={item.id}
                          className="flex items-baseline justify-between gap-3 px-3 py-2"
                        >
                          <span className="min-w-0 truncate">
                            <span className="text-xs text-muted-foreground">
                              {getRenovationBlock(blockId)?.title ?? blockId}
                              {" · "}
                            </span>
                            {findRenovationItemLabel(item.id) ?? item.id}
                            {item.comment ? (
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {item.comment}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">
                            {formatKzt(item.price)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!hidePrices && order.proposalId && (
                      <Button variant="outline" size="sm" asChild>
                        <a
                          href={`/api/calculator/proposal/${order.proposalId}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <FileText className="size-4" aria-hidden />
                          КП в PDF
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/calculator?order=${order.id}`}>Открыть в калькуляторе</Link>
                    </Button>
                  </div>
                </div>
                );
              })()}
              {!hidePrices && (
                <OrderMoneyPanel
                  orderId={order.id}
                  amount={order.amount}
                  prepayment={order.prepayment ?? 0}
                  payments={order.payments ?? []}
                  canWrite={canEdit}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="client">
          <Card>
            <CardHeader>
              <CardTitle>Клиент</CardTitle>
            </CardHeader>
            <CardContent>
              {wv ? (
                <dl className="grid gap-4 text-base sm:grid-cols-2">
                  {wv.clientName && (
                    <Meta label="ФИО" value={order.client?.fullName ?? null} />
                  )}
                  {wv.clientPhone && order.client?.phone && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Телефон</dt>
                      <dd>
                        <a
                          href={`tel:${order.client.phone}`}
                          className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {order.client.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  {wv.address && (
                    <Meta
                      label="Адрес"
                      value={order.address ?? order.client?.address ?? null}
                    />
                  )}
                </dl>
              ) : order.client ? (
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <Meta label="ФИО" value={order.client.fullName} />
                  <Meta label="Телефон" value={order.client.phone} />
                  <Meta label="WhatsApp" value={order.client.whatsapp} />
                  <Meta label="Email" value={order.client.email} />
                  <Meta
                    label="Адрес объекта"
                    value={order.address ?? order.client.address ?? null}
                  />
                  <Meta
                    label="Источник"
                    value={SOURCE_LABELS[order.client.source]}
                  />
                  <Meta
                    label="Заказов"
                    value={String(order.client.ordersCount)}
                  />
                  <Meta
                    label="Сумма по клиенту"
                    value={formatKzt(order.client.totalAmount)}
                    numeric
                  />
                  {order.client.comment && (
                    <div className="sm:col-span-2">
                      <Meta label="Комментарий" value={order.client.comment} />
                    </div>
                  )}
                  <div className="pt-1 sm:col-span-2">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/clients/${order.client.id}`}>
                        Карточка клиента
                      </Link>
                    </Button>
                  </div>
                </dl>
              ) : (
                <EmptyState
                  compact
                  title="Клиент не найден"
                  description="Возможно, карточку клиента удалили."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="production">
          <Card>
            <CardHeader>
              <CardTitle>Этапы производства</CardTitle>
            </CardHeader>
            <CardContent>
              {order.stages.length === 0 ? (
                <EmptyState
                  compact
                  icon={Factory}
                  title="Этапы не назначены"
                  description="Этапы задаются при создании заказа."
                />
              ) : (
                <ol className="relative ml-2 border-l border-border">
                  {order.stages.map((stage, i) => (
                    <li key={stage.id} className="relative pb-6 pl-6 last:pb-0">
                      <span
                        className={cn(
                          "absolute -left-[5px] top-1.5 size-2.5 rounded-full border",
                          stage.status === "done" &&
                            "border-success bg-success",
                          stage.status === "in_progress" &&
                            "border-primary bg-primary",
                          stage.status === "pending" &&
                            "border-muted-foreground/40 bg-panel",
                          stage.status === "blocked" &&
                            "border-destructive bg-destructive",
                        )}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {i + 1}.
                        </span>
                        <span className="font-medium text-foreground">
                          {stage.label}
                        </span>
                        <Badge variant={STAGE_STATUS_VARIANT[stage.status]}>
                          {STAGE_STATUS_LABEL[stage.status]}
                        </Badge>
                      </div>
                      {(stage.startDate || stage.endDate || stage.comment) && (
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {[
                            stage.startDate &&
                              `старт ${formatDateRu(stage.startDate)}`,
                            stage.endDate &&
                              `конец ${formatDateRu(stage.endDate)}`,
                            stage.durationHours != null &&
                              `${stage.durationHours} ч`,
                            stage.comment,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              {canEditProduction && !textiles && (
                <div className="mt-6">
                  <ProductionOperationsEditor
                    orderId={order.id}
                    updatedAt={order.updatedAt}
                    stages={order.stages}
                    checklist={order.checklist}
                    materials={order.productionMaterials ?? []}
                    comment={order.productionComment ?? null}
                    draftScope={productionDraftScope}
                  />
                </div>
              )}
            </CardContent>
          </Card>
          {canViewProductionAudit && order.audit.length > 0 && (
            <Card className="mt-4">
              <CardHeader><CardTitle>Журнал изменений производства</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {order.audit.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{entry.field}</span><span className="text-xs text-muted-foreground">{formatDateTimeRu(entry.createdAt)}</span></div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">{String(entry.previousValue ?? "—")} → {String(entry.nextValue ?? "—")}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{entry.actorName}{entry.reason ? ` · ${entry.reason}` : ""}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="checklist" className="space-y-4">
          <Card>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Чек-лист</CardTitle>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {doneCount} из {checklist.length}
                </span>
              </div>
              <Progress value={progress} aria-label="Выполнение чек-листа" />
            </CardHeader>
            <CardContent className="space-y-2">
              {checklist.length === 0 ? (
                <EmptyState
                  compact
                  icon={ListChecks}
                  title="Пунктов нет"
                  description="Чек-лист собирается из материалов заказа."
                />
              ) : (
                checklist.map((item) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg bg-panel-elevated px-3 py-2.5 transition-colors duration-150 hover:bg-foreground/[0.06]",
                      !canToggleChecklist && "cursor-default",
                    )}
                  >
                    <Checkbox
                      checked={item.done}
                      disabled={!canToggleChecklist || pendingId === item.id}
                      onCheckedChange={() => toggleItem(item)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm text-foreground",
                          item.done && "line-through text-muted-foreground",
                        )}
                      >
                        {item.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {item.quantity} {item.unit}
                        </span>
                        , {item.category}
                        {item.comment ? `. ${item.comment}` : ""}
                      </p>
                    </div>
                    {item.done ? (
                      <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
                    ) : (
                      <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </label>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="materials">
          <Card>
            <CardHeader>
              <CardTitle>Материалы и фурнитура</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
              <NoteBlock title="Материалы" text={order.materialsNote} />
              <NoteBlock title="Фурнитура" text={order.hardwareNote} />
            </CardContent>
          </Card>
        </TabsContent>

        {canSeeFinance && (
          <TabsContent value="finance">
            <Card>
              <CardHeader>
                <CardTitle>Финансы</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <FinanceStat label="Сумма" value={formatKzt(order.amount)} />
                <FinanceStat label="Себестоимость" value={formatKzt(order.cost)} />
                <FinanceStat
                  label="Прибыль"
                  value={formatKzt(order.profit)}
                  accent
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="tasks">
          <Card>
            <CardHeader>
              <CardTitle>Задачи</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {order.tasks.length === 0 ? (
                <EmptyState
                  compact
                  icon={ListTodo}
                  title="Задач по заказу нет"
                />
              ) : (
                order.tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 rounded-lg bg-panel-elevated px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {task.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          до {formatDateRu(task.deadline)}
                        </span>
                        , {(TASK_STATUS_LABEL[task.status] ?? task.status).toLowerCase()}
                      </p>
                    </div>
                    <Badge variant={TASK_PRIORITY_VARIANT[task.priority]} className="shrink-0">
                      {TASK_PRIORITY_LABEL[task.priority] ?? task.priority}
                    </Badge>
                  </div>
                ))
              )}
              <Button variant="ghost" size="sm" asChild className="mt-1 text-muted-foreground">
                <Link href="/tasks">Все задачи</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports">
          <Card>
            <CardHeader>
              <CardTitle>Отчёты</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {order.reports.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Отчётов пока нет"
                  description="Мастера сдают отчёты по мере работы над заказом."
                />
              ) : (
                order.reports.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg bg-panel-elevated p-3 text-sm"
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {r.employeeName}
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatDateRu(r.createdAt)}, {formatTimeRu(r.createdAt)}
                      </span>
                    </div>
                    <p className="text-foreground">{r.whatDone}</p>
                    {r.problems && (
                      <p className="mt-1 text-xs text-warning">
                        Проблемы: {r.problems}
                      </p>
                    )}
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      Единиц: {r.unitsDone}
                    </p>
                  </div>
                ))
              )}
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
                <Link href="/reports">Все отчёты</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="media">
          <Card>
            <CardHeader>
              <CardTitle>Файлы и заметки</CardTitle>
            </CardHeader>
            <CardContent>
              {textiles ? (
                <FilesAndNotes
                  entityType="order"
                  entityId={order.id}
                  photos={order.media}
                  notes={order.orderNotes ?? []}
                  canWrite={canWrite}
                  roomNames={roomNames}
                />
              ) : order.media.length === 0 ? (
                <EmptyState
                  compact
                  icon={FileText}
                  title="Файлов нет"
                />
              ) : (
                <ul className="divide-y divide-border">
                  {order.media.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-primary hover:underline"
                      >
                        {m.name}
                        <span className="ml-1 text-muted-foreground">({m.type})</span>
                      </a>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatDateRu(m.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {textiles && (
            <Card>
              <CardHeader>
                <CardTitle>История статусов</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusHistory history={order.statusHistory ?? []} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>История</CardTitle>
            </CardHeader>
            <CardContent>
              {order.history.length === 0 ? (
                <div className="space-y-4">
                  <EmptyState
                    compact
                    icon={History}
                    title="Записей активности нет"
                  />
                  <dl className="grid gap-3 rounded-lg bg-panel-elevated p-4 text-sm sm:grid-cols-3">
                    <Meta label="Создан" value={formatDateRu(order.createdAt)} numeric />
                    <Meta label="Обновлён" value={formatDateRu(order.updatedAt)} numeric />
                    <Meta label="Статус" value={statusLabel} />
                  </dl>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {order.history.map((h) => (
                    <li key={h.id} className="py-2.5 first:pt-0 last:pb-0">
                      <p className="text-sm text-foreground">{h.action}</p>
                      <p className="text-xs text-muted-foreground">
                        {h.actorName},{" "}
                        <span className="tabular-nums">
                          {formatDateRu(h.createdAt)}, {formatTimeRu(h.createdAt)}
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Meta({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string | null | undefined;
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 break-words",
          value ? "text-foreground" : "text-muted-foreground",
          numeric && "tabular-nums",
        )}
      >
        {value || "Не указано"}
      </dd>
    </div>
  );
}

function HeaderStat({
  label,
  value,
  strong,
  numeric,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
  numeric?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 truncate",
          value ? "text-foreground" : "text-muted-foreground",
          strong && "font-semibold",
          numeric && "tabular-nums",
        )}
      >
        {value ?? NOT_ASSIGNED}
      </dd>
    </div>
  );
}

function NoteBlock({ title, text }: { title: string; text: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-panel-elevated p-4">
      <p className="mb-2 text-sm font-medium text-muted-foreground">{title}</p>
      <p
        className={cn(
          "whitespace-pre-wrap",
          text ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {text || "Не указано"}
      </p>
    </div>
  );
}

function FinanceStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-panel-elevated p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          accent ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function VisibilityEditor({
  orderId,
  initial,
}: {
  orderId: string;
  initial: OrderWorkerVisibility;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerVisibility: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Не удалось сохранить");
        return;
      }
      toast.success("Видимость для сотрудника сохранена");
      router.refresh();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Что видит сотрудник на заказе</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorkerVisibilityFields value={value} onChange={setValue} disabled={saving} />
        <Button
          type="button"
          size="lg"
          className="min-h-12 w-full sm:w-auto"
          disabled={!dirty || saving}
          onClick={save}
        >
          {saving ? "Сохранение…" : "Сохранить видимость"}
        </Button>
      </CardContent>
    </Card>
  );
}
