"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, Hand, Loader2, Scissors, XCircle } from "lucide-react";
import { CancelWorkshopOrderDialog } from "@/features/workshop/cancel-workshop-order-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PushSettings } from "@/features/notifications/push-settings";
import { OrderStatusBadge } from "@/features/orders/order-status-badge";
import { formatDateTimeRu, StatusHistory } from "@/features/orders/status-history";
import { cn, formatDateRu } from "@/lib/utils";
import type { MediaItem, OrderStatusChange, AtelierOrderStatus } from "@/types";
import type { OrderAuditLog } from "@/types";
import { ProductionEditor } from "@/features/workshop/production-editor";

type Accepted = { userId: string; name: string } | null;

export type WorkshopOrderRow = {
  id: string;
  number: string;
  status: AtelierOrderStatus;
  clientName: string;
  address: string | null;
  deadline: string;
  summary: string;
  sewingOrderAt: string | null;
  acceptedBy: Accepted;
  acceptedAt: string | null;
  completedAt: string | null;
};

type ProductionMeta = {
  collection: "tulle" | "portiere" | "covers" | "pillows" | "cornices" | "rollers";
  fields: { key: string; label: string; value: number | null }[];
};
type TextItem = { id: string; text: string; production?: ProductionMeta };

export type WorkshopOrderDetail = {
  id: string;
  updatedAt: string;
  number: string;
  status: AtelierOrderStatus;
  clientName: string;
  address: string | null;
  deadline: string;
  comment: string | null;
  acceptedBy: Accepted;
  acceptedAt: string | null;
  statusHistory: OrderStatusChange[];
  audit: OrderAuditLog[];
  photos: MediaItem[];
  rooms: {
    id: string;
    name: string;
    fabrics: {
      id: string;
      kind: string;
      fabricName: string;
      width: number;
      height: number;
      meterage: number;
      metersNeeded: number;
      coeff: number | null;
      sewingMeters: number;
      tape: number | null;
      extras: string[];
      note?: string | null;
    }[];
    covers: TextItem[];
    pillows: TextItem[];
    cornices: TextItem[];
    rollers: TextItem[];
  }[];
};

const GROUPS: { status: AtelierOrderStatus; title: string }[] = [
  { status: "awaiting", title: "Ожидают принятия" },
  { status: "in_work", title: "В работе" },
  { status: "completed", title: "Завершённые" },
];

const REFRESH_MS = 20_000;

async function post(url: string) {
  const res = await fetch(url, { method: "POST" });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error ?? "Не удалось выполнить действие");
}

export function WorkshopView({
  orders,
  selected,
  currentUserId,
  canAccept,
  canManage,
  canEditProduction,
  canViewAudit,
  draftScope,
  canOpenSheet,
}: {
  orders: WorkshopOrderRow[];
  selected: WorkshopOrderDetail | null;
  currentUserId: string;
  canAccept: boolean;
  canManage: boolean;
  canEditProduction: boolean;
  canViewAudit: boolean;
  draftScope: string;
  canOpenSheet: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();
  const [cancelTarget, setCancelTarget] = useState<{
    id: string;
    number: string;
    acceptedBy: Accepted;
  } | null>(null);
  const awaitingCount = orders.filter((o) => o.status === "awaiting").length;

  // Opening the queue clears the «Цех» badge for this user.
  useEffect(() => {
    if (!canAccept) return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workshopSeen: true }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((json: { marked?: number }) => {
        if (json.marked) startTransition(() => router.refresh());
      })
      .catch(() => {});
  }, [canAccept, awaitingCount, router]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  async function cancelOrder(orderId: string) {
    setBusy(true);
    try {
      await post(`/api/orders/${orderId}/cancel`);
      toast.success("Заказ отменён, цех получил уведомление");
      setCancelTarget(null);
      if (selected) router.push("/workshop");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  const cancelDialog = (
    <CancelWorkshopOrderDialog
      order={cancelTarget}
      busy={busy}
      onOpenChange={(o) => !o && setCancelTarget(null)}
      onConfirm={(id) => void cancelOrder(id)}
    />
  );

  async function act(kind: "accept" | "complete", orderId: string) {
    setBusy(true);
    try {
      await post(`/api/orders/${orderId}/${kind}`);
      toast.success(kind === "accept" ? "Заказ принят в работу" : "Заказ завершён");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
      startTransition(() => router.refresh());
    }
  }

  if (selected) {
    const mine = selected.acceptedBy?.userId === currentUserId;
    return (
      <div className="space-y-6 pb-8">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground" asChild>
          <Link href="/workshop">
            <ArrowLeft className="size-4" aria-hidden />
            К очереди цеха
          </Link>
        </Button>
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-panel p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tabular-nums tracking-tight">
                Заказ №{selected.number}
              </h1>
              <OrderStatusBadge status={selected.status} textiles />
            </div>
            <p className="text-sm text-muted-foreground">
              {selected.clientName}
              {selected.address ? ` · ${selected.address}` : ""}
            </p>
            <p className="text-sm tabular-nums text-muted-foreground">
              Срок: {formatDateRu(selected.deadline)}
            </p>
            {selected.acceptedBy && (
              <p className="text-sm">
                Исполнитель: <span className="font-medium">{selected.acceptedBy.name}</span>
                {selected.acceptedAt && (
                  <span className="text-muted-foreground">
                    , принят {formatDateTimeRu(selected.acceptedAt)}
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            {canAccept && selected.status === "awaiting" && (
              <Button
                size="lg"
                disabled={busy}
                onClick={() => void act("accept", selected.id)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Hand className="size-4" />}
                Принять в работу
              </Button>
            )}
            {selected.status === "in_work" && (mine || canManage) && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void act("complete", selected.id)}
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Завершить
              </Button>
            )}
            {canManage && (selected.status === "awaiting" || selected.status === "in_work") && (
              <Button
                variant="destructive"
                size="lg"
                className="touch-manipulation min-h-12"
                disabled={busy}
                onClick={() =>
                  setCancelTarget({
                    id: selected.id,
                    number: selected.number,
                    acceptedBy: selected.acceptedBy,
                  })
                }
              >
                <XCircle className="size-4" aria-hidden />
                Отменить заказ
              </Button>
            )}
            {canOpenSheet && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/orders/${selected.number}/workshop`}>
                  <FileText className="size-4" aria-hidden />
                  Заказ на пошив
                </Link>
              </Button>
            )}
          </div>
        </header>

        {selected.comment && (
          <Card>
            <CardHeader>
              <CardTitle>Комментарий</CardTitle>
            </CardHeader>
            <CardContent className="whitespace-pre-wrap text-sm">{selected.comment}</CardContent>
          </Card>
        )}

        {selected.rooms.length === 0 ? (
          <EmptyState compact icon={Scissors} title="В заказе нет позиций калькулятора" />
        ) : (
          selected.rooms.map((room) => (
            <Card key={room.id}>
              <CardHeader>
                <CardTitle>{room.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                {room.fabrics.length > 0 && (
                  <ul className="divide-y divide-border rounded-md border border-border">
                    {room.fabrics.map((f) => (
                      <li key={f.id} className="space-y-1 px-3 py-2">
                        <p className="font-medium">
                          {f.kind}: {f.fabricName || "ткань не выбрана"}
                        </p>
                        <p className="tabular-nums text-muted-foreground">
                          {f.width > 0 && f.height > 0 ? `Окно ${f.width}×${f.height} м · ` : ""}
                          метраж {f.meterage} м
                          {f.coeff ? ` × ${f.coeff}` : ""} = {f.metersNeeded} м · пошив{" "}
                          {f.sewingMeters} м{f.tape != null ? ` · тесьма ${f.tape} м` : ""}
                        </p>
                        {canEditProduction && (
                          <ProductionEditor
                            orderId={selected.id}
                            roomId={room.id}
                            collection={f.kind === "Тюль" ? "tulle" : "portiere"}
                            lineId={f.id}
                            updatedAt={selected.updatedAt}
                            fields={[
                              { key: "meterage", label: "Расход ткани, м", value: f.meterage },
                              { key: "sewing.meters", label: "Пошив, м", value: f.sewingMeters },
                              { key: "width", label: "Ширина, м", value: f.width },
                              { key: "height", label: "Высота, м", value: f.height },
                            ]}
                            draftScope={draftScope}
                          />
                        )}
                        {f.extras.length > 0 && (
                          <p className="text-muted-foreground">Доп.: {f.extras.join(", ")}</p>
                        )}
                        {f.note && (
                          <p className="mt-1 whitespace-pre-wrap rounded-md border-l-4 border-amber-500 bg-amber-500/10 px-2 py-1">
                            <span className="font-semibold">Комментарий: </span>
                            {f.note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {(
                  [
                    ["Покрывала", room.covers],
                    ["Подушки", room.pillows],
                    ["Карнизы", room.cornices],
                    ["Рулонные шторы", room.rollers],
                  ] as const
                ).map(([title, items]) =>
                  items.length > 0 ? (
                    <div key={title}>
                      <p className="mb-1 font-medium">{title}</p>
                      <ul className="list-inside list-disc text-muted-foreground">
                            {items.map((i) => (
                          <li key={i.id} className="tabular-nums">
                            <p>{i.text}</p>
                            {canEditProduction && i.production && (
                              <ProductionEditor
                                orderId={selected.id}
                                roomId={room.id}
                                lineId={i.id}
                                updatedAt={selected.updatedAt}
                                collection={i.production.collection}
                                fields={i.production.fields}
                                draftScope={draftScope}
                              />
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null,
                )}
              </CardContent>
            </Card>
          ))
        )}

        {selected.photos.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Фото</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {selected.photos.map((p) => (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                  <img
                    src={p.url}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-square w-full rounded-md object-cover"
                  />
                </a>
              ))}
            </CardContent>
          </Card>
        )}

        {cancelDialog}
        <Card>
          <CardHeader>
            <CardTitle>История статусов</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusHistory history={selected.statusHistory} />
          </CardContent>
        </Card>
        {canViewAudit && (
          <Card>
            <CardHeader>
              <CardTitle>Журнал изменений производства</CardTitle>
            </CardHeader>
            <CardContent>
              {selected.audit.length === 0 ? (
                <p className="text-sm text-muted-foreground">Изменений пока нет</p>
              ) : (
                <ul className="space-y-3">
                  {selected.audit.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{entry.field}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTimeRu(entry.createdAt)}</span>
                      </div>
                      <p className="mt-1 tabular-nums text-muted-foreground">
                        {String(entry.previousValue ?? "—")} → {String(entry.nextValue ?? "—")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {entry.actorName}{entry.reason ? ` · ${entry.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Швейный цех</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Заказы из калькулятора. Принять заказ может только одна швея.
        </p>
      </header>
      {GROUPS.map((group) => {
        const rows = orders
          .filter((o) => o.status === group.status)
          .slice(0, group.status === "completed" ? 10 : undefined);
        return (
          <section key={group.status} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              {group.title}
              <Badge variant="outline">{orders.filter((o) => o.status === group.status).length}</Badge>
            </h2>
            {rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Пусто
              </p>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-panel">
                {rows.map((o) => (
                  <li key={o.id} className="flex items-stretch">
                    <Link
                      href={`/workshop?order=${o.number}`}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 transition-colors hover:bg-foreground/[0.04] sm:flex-row sm:items-center sm:justify-between",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          <span className="tabular-nums">№{o.number}</span> · {o.clientName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {o.summary || "без позиций"} · срок {formatDateRu(o.deadline)}
                        </p>
                      </div>
                      <p className="shrink-0 text-xs text-muted-foreground">
                        {o.acceptedBy
                          ? `${o.acceptedBy.userId === currentUserId ? "Вы" : o.acceptedBy.name}${o.acceptedAt ? `, ${formatDateTimeRu(o.acceptedAt)}` : ""}`
                          : o.sewingOrderAt
                            ? `Передан ${formatDateTimeRu(o.sewingOrderAt)}`
                            : ""}
                      </p>
                    </Link>
                    {canManage && (o.status === "awaiting" || o.status === "in_work") && (
                      <div className="flex shrink-0 items-center pr-3">
                        <Button
                          variant="outline"
                          size="lg"
                          className="touch-manipulation min-h-12 border-destructive/40 text-destructive"
                          disabled={busy}
                          onClick={() =>
                            setCancelTarget({ id: o.id, number: o.number, acceptedBy: o.acceptedBy })
                          }
                        >
                          <XCircle className="size-4" aria-hidden />
                          Отменить заказ
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {cancelDialog}
      <PushSettings />
    </div>
  );
}
