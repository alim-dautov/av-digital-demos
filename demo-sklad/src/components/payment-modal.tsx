"use client";
import { useState } from "react";
import { Banknote } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { PAY_METHODS } from "@/lib/labels";
import { money, today } from "@/lib/format";
import { createPaymentAction } from "@/modules/finance/actions";

export function PaymentButton({ direction, counterparty, orderId, receiptId, shipmentId, amount, label, variant = "secondary" }: {
  direction: "in" | "out"; counterparty: { id: number; name: string }; orderId?: number; receiptId?: number; shipmentId?: number; amount?: number; label?: string; variant?: "primary" | "secondary" | "accent";
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount: amount ?? 0, method: "cash" as "cash" | "kaspi" | "transfer", date: today(), comment: "" });
  const { pending, run } = useRun();
  return (
    <>
      <Button variant={variant} icon={<Banknote className="size-4" />} onClick={() => { setF((x) => ({ ...x, amount: amount ?? x.amount })); setOpen(true); }}>{label ?? (direction === "in" ? "Принять оплату" : "Оплатить")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={direction === "in" ? `Оплата от ${counterparty.name}` : `Оплата: ${counterparty.name}`} size="sm"
        footer={<><Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="accent" loading={pending} disabled={f.amount <= 0}
            onClick={() => run(() => createPaymentAction({ direction, counterpartyId: counterparty.id, orderId: orderId ?? null, receiptId: receiptId ?? null, shipmentId: shipmentId ?? null, ...f }), {
              success: (r) => (r.paidOrder ? `Оплата проведена. Заявка №${r.paidOrder.number} → «Оплачен»` : "Оплата проведена"), onOk: () => setOpen(false),
            })}>Провести {f.amount > 0 ? money(f.amount) : ""}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Сумма"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus /></Field>
          <Field label="Способ">
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(PAY_METHODS) as (keyof typeof PAY_METHODS)[]).map((m) => (
                <button key={m} type="button" onClick={() => setF({ ...f, method: m })} className={cn("h-11 rounded-xl border text-sm font-semibold", f.method === m ? "border-yellow bg-yellow-50 text-navy dark:bg-white/5 dark:text-yellow" : "border-line text-ink-2")}>{PAY_METHODS[m]}</button>
              ))}
            </div>
          </Field>
          <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="min-h-16" /></Field>
        </div>
      </Modal>
    </>
  );
}

export function MethodSelect({ value, onChange }: { value: string; onChange: (v: "cash" | "kaspi" | "transfer") => void }) {
  return <Select value={value} onChange={(e) => onChange(e.target.value as "cash")}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>;
}
