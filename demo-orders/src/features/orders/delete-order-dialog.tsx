"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { formatKzt, pluralRu } from "@/lib/utils";
import type { DeletionMode, DeletionSummary } from "@/lib/services/order-deletion";

export type DeletableOrder = { id: string; number: string };

type Props = {
  order: DeletableOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (order: DeletableOrder, mode: DeletionMode) => void;
};

const IN_WORKSHOP = new Set(["awaiting", "in_work", "production"]);

function relatedLines(s: DeletionSummary): string[] {
  const lines: string[] = [];
  if (s.quote) lines.push(`Расчёт калькулятора: ${pluralRu(s.quote.rooms, ["комната", "комнаты", "комнат"])}`);
  if (s.proposals) lines.push(`Коммерческие предложения: ${s.proposals}`);
  if (s.measurements) lines.push(`Замеры: ${s.measurements}`);
  if (s.expenses.count) {
    lines.push(`Расходы по себестоимости: ${s.expenses.count} на ${formatKzt(s.expenses.amount)}`);
  }
  if (s.cash.count) lines.push(`Операции в кассе: ${s.cash.count} на ${formatKzt(s.cash.amount)}`);
  if (s.payroll) lines.push(`Начисления и авансы: ${s.payroll}`);
  if (s.stockMovements) lines.push(`Движения склада: ${s.stockMovements}`);
  if (s.sewing.sentAt) {
    lines.push(
      s.sewing.acceptedBy ? `Передан в цех, принял: ${s.sewing.acceptedBy}` : "Передан в цех",
    );
  }
  if (s.sewing.history) lines.push(`История статусов: ${s.sewing.history}`);
  if (s.tasks) lines.push(`Задачи: ${s.tasks}`);
  if (s.notifications) lines.push(`Уведомления: ${s.notifications}`);
  return lines;
}

function moneyNotice(s: DeletionSummary): string {
  const parts: string[] = [];
  if (s.cash.count) parts.push(`оплаты на ${formatKzt(s.cash.amount)}`);
  if (s.expenses.count) parts.push(`расходы на ${formatKzt(s.expenses.amount)}`);
  const head = parts.length ? `Есть ${parts.join(" и ")}.` : "По заказу есть финансовые записи.";
  return `${head} Заказ будет скрыт, но останется в финансовых отчётах и кассе.`;
}

function SummaryBody({ orderId }: { orderId: string }) {
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/orders/${encodeURIComponent(orderId)}/deletion`, { signal: controller.signal })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Не удалось загрузить данные заказа");
        setSummary(json.summary as DeletionSummary);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(e instanceof Error ? e.message : "Не удалось загрузить данные заказа");
      });
    return () => controller.abort();
  }, [orderId]);

  if (loadError) return <p className="text-sm text-destructive">{loadError}</p>;
  if (!summary) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Проверяем связанные данные…
      </p>
    );
  }

  const lines = relatedLines(summary);
  return (
    <div className="space-y-3 text-sm">
      {summary.mode === "archived" ? (
        <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <p>{moneyNotice(summary)}</p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Заказ исчезнет из списков, аналитики, цеха и зарплат; открытые задачи и уведомления
          по нему будут убраны. Данные не стираются: в журнале останется, кто и когда удалил.
        </p>
      )}
      {IN_WORKSHOP.has(summary.status) && (
        <div className="flex gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>Заказ сейчас в работе в цехе. Швеи перестанут его видеть.</p>
        </div>
      )}
      {lines.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Связанные данные</p>
          <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function DeleteOrderDialog({ order, open, onOpenChange, onDeleted }: Props) {
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const matches = order != null && typed.trim() === order.number;

  function change(next: boolean) {
    if (pending) return;
    if (!next) setTyped("");
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!order || !matches || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(order.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmNumber: typed.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok || res.status === 404) {
        const mode: DeletionMode = res.ok ? json.mode : "deleted";
        toast.success(
          mode === "archived"
            ? `Заказ №${order.number} удалён, финансовые записи сохранены`
            : `Заказ №${order.number} удалён`,
        );
        setTyped("");
        onOpenChange(false);
        onDeleted(order, mode);
        return;
      }
      toast.error(json.error ?? "Не удалось удалить заказ");
    } catch {
      toast.error("Нет связи с сервером");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить заказ №{order?.number}?</DialogTitle>
          <DialogDescription>Действие нельзя отменить.</DialogDescription>
        </DialogHeader>
        {order && <SummaryBody key={order.id} orderId={order.id} />}
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="delete-order-number">Введите номер заказа для подтверждения</Label>
            <Input
              id="delete-order-number"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={order?.number}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={pending}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="lg" className="h-12" onClick={() => change(false)} disabled={pending}>
              Отмена
            </Button>
            <Button type="submit" variant="destructive" size="lg" className="h-12" disabled={!matches || pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Trash2 className="size-4" aria-hidden />
              )}
              Удалить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
