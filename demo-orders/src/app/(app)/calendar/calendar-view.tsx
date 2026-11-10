"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn, parseTimeToMinutes } from "@/lib/utils";
import type { Measurement, MeasurementStatus } from "@/types";

type Person = { id: string; fullName: string; phone: string };
type ClientOpt = { id: string; fullName: string; phone: string; address: string };
type OrderOpt = { id: string; number: string; clientId: string; address: string };
type Load = Record<string, { bookedMin: number; capacityMin: number; count: number }>;

const SLOT_MIN = 30;
const DURATIONS = [30, 60, 90, 120, 180];

const STATUS_LABELS: Record<MeasurementStatus, string> = {
  planned: "Запланирован",
  done: "Выполнен",
  cancelled: "Отменён",
};

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function endTime(m: Pick<Measurement, "startTime" | "durationMin">) {
  return minutesToTime(parseTimeToMinutes(m.startTime) + m.durationMin);
}

type FormState = {
  id: string | null;
  clientId: string;
  orderId: string;
  measurerId: string;
  date: string;
  startTime: string;
  durationMin: number;
  address: string;
  status: MeasurementStatus;
  comment: string;
};

export function CalendarView({
  view,
  anchor,
  today,
  dates,
  measurers,
  measurements,
  clients,
  orders,
  load,
  workWindow,
  canWrite,
}: {
  view: "day" | "week";
  anchor: string;
  today: string;
  dates: string[];
  measurers: Person[];
  measurements: Measurement[];
  clients: ClientOpt[];
  orders: OrderOpt[];
  load: Load;
  workWindow: { workStart: string; workEnd: string; workDays: number[] };
  canWrite: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<FormState | null>(null);
  const [pending, setPending] = React.useState(false);

  const clientMap = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const orderMap = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);

  const startMin = parseTimeToMinutes(workWindow.workStart);
  const endMin = parseTimeToMinutes(workWindow.workEnd);
  const slots = React.useMemo(() => {
    const out: number[] = [];
    for (let m = startMin; m + SLOT_MIN <= endMin; m += SLOT_MIN) out.push(m);
    return out;
  }, [startMin, endMin]);

  const active = measurements.filter((m) => m.status !== "cancelled");

  function busyAt(measurerId: string, date: string, slot: number, ignoreId?: string | null) {
    return active.find(
      (m) =>
        m.id !== ignoreId &&
        m.measurerId === measurerId &&
        m.date === date &&
        parseTimeToMinutes(m.startTime) < slot + SLOT_MIN &&
        slot < parseTimeToMinutes(m.startTime) + m.durationMin,
    );
  }

  function firstFreeSlot(measurerId: string, date: string) {
    const s = slots.find((slot) => !busyAt(measurerId, date, slot));
    return s === undefined ? workWindow.workStart : minutesToTime(s);
  }

  function navigate(next: { date?: string; view?: "day" | "week" }) {
    const q = new URLSearchParams({ date: next.date ?? anchor, view: next.view ?? view });
    router.push(`/calendar?${q.toString()}`);
  }

  function shift(dir: -1 | 1) {
    navigate({ date: format(addDays(parseISO(anchor), dir * (view === "day" ? 1 : 7)), "yyyy-MM-dd") });
  }

  function openCreate(measurerId: string, date: string, startTime?: string) {
    if (!canWrite) return;
    setForm({
      id: null,
      clientId: "",
      orderId: "",
      measurerId,
      date,
      startTime: startTime ?? firstFreeSlot(measurerId, date),
      durationMin: 60,
      address: "",
      status: "planned",
      comment: "",
    });
  }

  function openEdit(m: Measurement) {
    setForm({
      id: m.id,
      clientId: m.clientId,
      orderId: m.orderId ?? "",
      measurerId: m.measurerId,
      date: m.date,
      startTime: m.startTime,
      durationMin: m.durationMin,
      address: m.address,
      status: m.status,
      comment: m.comment ?? "",
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.clientId) {
      toast.error("Выберите клиента");
      return;
    }
    setPending(true);
    try {
      const body = {
        ...(form.id ? { id: form.id } : {}),
        clientId: form.clientId,
        orderId: form.orderId || null,
        measurerId: form.measurerId,
        date: form.date,
        startTime: form.startTime,
        durationMin: form.durationMin,
        address: form.address,
        status: form.status,
        comment: form.comment || null,
      };
      const res = await fetch("/api/measurements", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      toast.success(form.id ? "Замер обновлён" : "Замер запланирован");
      setForm(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!form?.id || !window.confirm("Удалить замер?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/measurements?id=${encodeURIComponent(form.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Не удалось удалить");
      toast.success("Замер удалён");
      setForm(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  const title =
    view === "day"
      ? format(parseISO(anchor), "EEEE, d MMMM yyyy", { locale: ru })
      : `${format(parseISO(dates[0]), "d MMM", { locale: ru })} — ${format(parseISO(dates[6]), "d MMM yyyy", { locale: ru })}`;

  const clientOrders = form ? orders.filter((o) => o.clientId === form.clientId) : [];

  function Chip({ m }: { m: Measurement }) {
    const c = clientMap.get(m.clientId);
    const o = m.orderId ? orderMap.get(m.orderId) : null;
    return (
      <button
        type="button"
        onClick={() => openEdit(m)}
        className={cn(
          "w-full rounded-md border px-2 py-1 text-left text-xs transition-colors",
          m.status === "planned" && "border-primary/40 bg-primary/10 hover:bg-primary/15",
          m.status === "done" && "border-success/40 bg-success/10 hover:bg-success/15",
          m.status === "cancelled" && "border-border bg-muted/40 text-muted-foreground line-through",
        )}
      >
        <span className="font-medium tabular-nums">
          {m.startTime}–{endTime(m)}
        </span>{" "}
        <span className="truncate">{c?.fullName ?? "Клиент"}</span>
        {o ? <span className="block truncate text-muted-foreground">{o.number}</span> : null}
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Календарь замеров</h1>
          <p className="mt-1 text-sm capitalize text-muted-foreground">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border p-0.5">
            {(["day", "week"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navigate({ view: v })}
                className={cn(
                  "rounded-sm px-3 py-1 text-xs font-medium",
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {v === "day" ? "День" : "Неделя"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" aria-label="Назад" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ date: today })}>
            Сегодня
          </Button>
          <Button variant="outline" size="icon" aria-label="Вперёд" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
          {canWrite && measurers.length > 0 && (
            <Button onClick={() => openCreate(measurers[0].id, view === "day" ? anchor : today >= dates[0] && today <= dates[dates.length - 1] ? today : dates[0])}>
              <Plus className="size-4" /> Замер
            </Button>
          )}
        </div>
      </header>

      {measurers.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel">
          <EmptyState
            icon={CalendarDays}
            title="Нет замерщиков"
            description="Отметьте сотрудников как замерщиков в их карточке"
          />
          <div className="pb-6 text-center">
            <Button variant="outline" asChild>
              <Link href="/employees">К сотрудникам</Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <section aria-label="Загрузка замерщиков" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {measurers.map((p) => {
              const l = load[p.id] ?? { bookedMin: 0, capacityMin: 0, count: 0 };
              const pct = l.capacityMin ? Math.round((l.bookedMin / l.capacityMin) * 100) : 0;
              return (
                <div key={p.id} className="rounded-lg border border-border bg-panel p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate font-medium">{p.fullName}</p>
                    <span className={cn("text-sm tabular-nums", pct >= 85 ? "text-warning" : "text-muted-foreground")}>
                      {pct}%
                    </span>
                  </div>
                  <Progress value={Math.min(100, pct)} className="mt-2 h-1.5" aria-label={`Загрузка ${p.fullName}`} />
                  <p className="mt-2 text-xs text-muted-foreground">
                    {l.count} замер(ов) · занято {Math.round(l.bookedMin / 6) / 10} ч из {Math.round(l.capacityMin / 60)} ч
                  </p>
                </div>
              );
            })}
          </section>

          {view === "day" ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-panel">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-20 border-b border-border p-2 text-left text-xs font-medium text-muted-foreground">Время</th>
                    {measurers.map((p) => (
                      <th key={p.id} className="border-b border-l border-border p-2 text-left text-xs font-medium">
                        {p.fullName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot}>
                      <td className="border-b border-border p-2 align-top text-xs tabular-nums text-muted-foreground">
                        {minutesToTime(slot)}
                      </td>
                      {measurers.map((p) => {
                        const m = busyAt(p.id, anchor, slot);
                        const starts = m && parseTimeToMinutes(m.startTime) >= slot && parseTimeToMinutes(m.startTime) < slot + SLOT_MIN;
                        return (
                          <td key={p.id} className="h-10 border-b border-l border-border p-1 align-top">
                            {m ? (
                              starts ? <Chip m={m} /> : <div className="h-full min-h-7 rounded-md bg-primary/10" aria-label="Занято" />
                            ) : (
                              <button
                                type="button"
                                disabled={!canWrite}
                                onClick={() => openCreate(p.id, anchor, minutesToTime(slot))}
                                className="h-full min-h-7 w-full rounded-md text-xs text-muted-foreground/0 transition-colors hover:bg-muted hover:text-muted-foreground disabled:cursor-default disabled:hover:bg-transparent"
                              >
                                Свободно
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-panel">
              <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="w-40 border-b border-border p-2 text-left text-xs font-medium text-muted-foreground">Замерщик</th>
                    {dates.map((d) => (
                      <th
                        key={d}
                        className={cn(
                          "border-b border-l border-border p-2 text-left text-xs font-medium capitalize",
                          d === today && "text-primary",
                        )}
                      >
                        <button type="button" className="hover:underline" onClick={() => navigate({ date: d, view: "day" })}>
                          {format(parseISO(d), "EEE d", { locale: ru })}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {measurers.map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-border p-2 align-top font-medium">{p.fullName}</td>
                      {dates.map((d) => {
                        const dayItems = measurements.filter((m) => m.measurerId === p.id && m.date === d);
                        const freeCount = slots.filter((s) => !busyAt(p.id, d, s)).length;
                        return (
                          <td key={d} className="border-b border-l border-border p-1.5 align-top">
                            <div className="mb-1.5 flex gap-px" aria-label={`Свободно слотов: ${freeCount}`}>
                              {slots.map((s) => (
                                <span
                                  key={s}
                                  title={`${minutesToTime(s)} — ${busyAt(p.id, d, s) ? "занято" : "свободно"}`}
                                  className={cn("h-1.5 flex-1 rounded-[1px]", busyAt(p.id, d, s) ? "bg-primary" : "bg-muted")}
                                />
                              ))}
                            </div>
                            <div className="space-y-1">
                              {dayItems.map((m) => (
                                <Chip key={m.id} m={m} />
                              ))}
                            </div>
                            {canWrite && freeCount > 0 && (
                              <button
                                type="button"
                                onClick={() => openCreate(p.id, d)}
                                className="mt-1 w-full rounded-md py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                + свободно {Math.round((freeCount * SLOT_MIN) / 6) / 10} ч
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Замер" : "Новый замер"}</DialogTitle>
            <DialogDescription>Привяжите замер к клиенту и, при необходимости, к заказу</DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Клиент</Label>
                <Select
                  value={form.clientId}
                  disabled={!canWrite}
                  onValueChange={(v) =>
                    setForm((f) => f && { ...f, clientId: v, orderId: "", address: f.address || clientMap.get(v)?.address || "" })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите клиента" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.fullName} · {c.phone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Заказ</Label>
                <Select
                  value={form.orderId || "none"}
                  disabled={!canWrite || !form.clientId}
                  onValueChange={(v) =>
                    setForm((f) => f && { ...f, orderId: v === "none" ? "" : v, address: (v !== "none" && orderMap.get(v)?.address) || f.address })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без заказа</SelectItem>
                    {clientOrders.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Замерщик</Label>
                <Select value={form.measurerId} disabled={!canWrite} onValueChange={(v) => setForm((f) => f && { ...f, measurerId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {measurers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="meas-date">Дата</Label>
                <Input
                  id="meas-date"
                  type="date"
                  value={form.date}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, date: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Начало</Label>
                <Select value={form.startTime} disabled={!canWrite} onValueChange={(v) => setForm((f) => f && { ...f, startTime: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {slots.map((s) => {
                      const busy = busyAt(form.measurerId, form.date, s, form.id);
                      return (
                        <SelectItem key={s} value={minutesToTime(s)}>
                          {minutesToTime(s)} {busy ? "· занято" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Длительность</Label>
                <Select
                  value={String(form.durationMin)}
                  disabled={!canWrite}
                  onValueChange={(v) => setForm((f) => f && { ...f, durationMin: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d < 60 ? `${d} мин` : `${d / 60} ч`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="meas-address">Адрес</Label>
                <Input
                  id="meas-address"
                  value={form.address}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, address: e.target.value })}
                />
              </div>
              {form.id && (
                <div>
                  <Label>Статус</Label>
                  <Select
                    value={form.status}
                    disabled={!canWrite}
                    onValueChange={(v) => setForm((f) => f && { ...f, status: v as MeasurementStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as MeasurementStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.id && form.status !== "planned" && (
                <div className="flex items-end pb-2">
                  <Badge variant={form.status === "done" ? "success" : "secondary"}>{STATUS_LABELS[form.status]}</Badge>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor="meas-comment">Комментарий</Label>
                <Textarea
                  id="meas-comment"
                  value={form.comment}
                  disabled={!canWrite}
                  onChange={(e) => setForm((f) => f && { ...f, comment: e.target.value })}
                />
              </div>
              {canWrite && (
                <DialogFooter className="gap-2 sm:col-span-2">
                  {form.id && (
                    <Button type="button" variant="ghost" disabled={pending} onClick={() => void remove()}>
                      Удалить
                    </Button>
                  )}
                  <Button type="submit" disabled={pending}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Сохранить
                  </Button>
                </DialogFooter>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
