"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orderBalance, orderPaymentsTotal, orderPrepayment } from "@/lib/domain/order-money";
import { formatDateRu, formatKzt, todayDate } from "@/lib/utils";
import type { OrderPayment } from "@/types";

function parseMoney(text: string): number {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function OrderMoneyPanel({
  orderId,
  amount,
  prepayment,
  payments,
  canWrite,
}: {
  orderId: string;
  amount: number;
  prepayment: number;
  payments: OrderPayment[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prepayText, setPrepayText] = useState(prepayment ? String(prepayment) : "");
  const [payText, setPayText] = useState("");
  const [date, setDate] = useState(todayDate());
  const [comment, setComment] = useState("");
  const view = {
    amount,
    prepayment: orderPrepayment({ prepayment }),
    paid: orderPaymentsTotal({ payments }),
    balance: orderBalance({ amount, prepayment, payments }),
  };

  async function save() {
    const res = await fetch(`/api/orders/${orderId}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prepayment: parseMoney(prepayText),
        amount: parseMoney(payText),
        date,
        comment,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Не удалось сохранить оплату");
      return;
    }
    setPayText("");
    setComment("");
    toast.success("Оплата записана в кассу");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-3 border-t border-border pt-3">
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Сумма</dt>
          <dd className="font-medium tabular-nums">{formatKzt(view.amount)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Предоплата</dt>
          <dd className="font-medium tabular-nums">{formatKzt(view.prepayment)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Оплаты</dt>
          <dd className="font-medium tabular-nums">{formatKzt(view.paid)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Остаток</dt>
          <dd className="font-semibold tabular-nums">{formatKzt(view.balance)}</dd>
        </div>
      </dl>
      {payments.length > 0 && (
        <ul className="space-y-1 text-sm text-muted-foreground">
          {payments.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-3">
              <span>
                {formatDateRu(payment.date)}
                {payment.comment ? ` · ${payment.comment}` : ""}
              </span>
              <span className="tabular-nums text-foreground">{formatKzt(payment.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      {canWrite && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <Label htmlFor="order-prepay">Предоплата, ₸</Label>
            <Input
              id="order-prepay"
              type="number"
              inputMode="decimal"
              min={0}
              value={prepayText}
              onChange={(event) => setPrepayText(event.target.value)}
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="order-pay">Оплата, ₸</Label>
            <Input
              id="order-pay"
              type="number"
              inputMode="decimal"
              min={0}
              value={payText}
              onChange={(event) => setPayText(event.target.value)}
              className="tabular-nums"
            />
          </div>
          <div>
            <Label htmlFor="order-pay-date">Дата</Label>
            <Input
              id="order-pay-date"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="order-pay-comment">Комментарий</Label>
            <Input
              id="order-pay-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          <div className="sm:col-span-4">
            <Button type="button" onClick={save} disabled={pending}>
              Записать в кассу
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
