"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { orderBalance } from "@/lib/domain/order-money";
import { formatKzt } from "@/lib/utils";
import type { OrderPayment } from "@/types";

export type EditableOrder = {
  id: string;
  updatedAt: string;
  number: string;
  amount: number;
  prepayment?: number;
  address?: string | null;
  payments?: OrderPayment[];
  date: string;
  deadline: string;
  closedAt?: string | null;
  masterId?: string | null;
  masterIds?: string[];
  masterOptions: { id: string; fullName: string }[];
  description: string;
  comment: string | null;
  client: { fullName: string; phone: string; address?: string | null } | null;
};

type Props = {
  order: EditableOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  showMoney: boolean;
};

function initial(order: EditableOrder) {
  const ids = [...new Set([order.masterId, ...(order.masterIds ?? [])].filter((id): id is string => !!id))];
  return {
    clientName: order.client?.fullName ?? "",
    clientPhone: order.client?.phone ?? "",
    address: order.address ?? order.client?.address ?? "",
    amount: String(order.amount ?? 0),
    prepayment: String(order.prepayment ?? 0),
    date: order.date?.slice(0, 10) ?? "",
    deadline: order.deadline?.slice(0, 10) ?? "",
    closedAt: order.closedAt?.slice(0, 10) ?? "",
    master: ids[0] ?? "",
    secondMaster: ids[1] ?? "",
    description: order.description ?? "",
    comment: order.comment ?? "",
  };
}

/** «Изменить заказ»: клиент, деньги, даты, описание и комментарий. Каждое сохранение пишется в журнал. */
export function EditOrderDialog(props: Props) {
  const key = `${props.order.id}:${props.order.updatedAt}:${props.open ? "open" : "closed"}`;
  return <EditOrderDialogForm key={key} {...props} />;
}

function EditOrderDialogForm({ order, open, onOpenChange, onSaved, showMoney }: Props) {
  const [form, setForm] = useState(() => initial(order));
  const [pending, setPending] = useState(false);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const start = initial(order);
    const body: Record<string, unknown> = {};
    if (order.client) {
      if (form.clientName.trim() !== start.clientName) body.clientName = form.clientName;
      if (form.clientPhone.trim() !== start.clientPhone) body.clientPhone = form.clientPhone;
    }
    if (form.address !== start.address) body.address = form.address;
    if (showMoney) {
      if (form.amount !== start.amount) body.amount = form.amount;
      if (form.prepayment !== start.prepayment) body.prepayment = form.prepayment;
    }
    if (form.date && form.date !== start.date) body.date = form.date;
    if (form.deadline && form.deadline !== start.deadline) body.deadline = form.deadline;
    if (form.closedAt !== start.closedAt) body.closedAt = form.closedAt;
    if (form.master !== start.master || form.secondMaster !== start.secondMaster) {
      body.masterIds = [form.master, form.secondMaster].filter(Boolean);
    }
    if (form.description.trim() && form.description.trim() !== start.description) {
      body.description = form.description;
    }
    if (form.comment.trim() !== start.comment) body.comment = form.comment;
    if (Object.keys(body).length === 0) {
      onOpenChange(false);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Не удалось сохранить");
      toast.success(`Заказ №${order.number} обновлён`);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка сети");
    } finally {
      setPending(false);
    }
  }

  const field = "h-12 text-base";
  const balance = orderBalance({
    amount: Number(form.amount) || 0,
    prepayment: Number(form.prepayment) || 0,
    payments: order.payments ?? [],
  });
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form onSubmit={save} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Изменить заказ №{order.number}</DialogTitle>
            <DialogDescription>Изменения сохранятся в журнале заказа.</DialogDescription>
          </DialogHeader>
          {order.client && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="eo-client">Клиент</Label>
                <Input id="eo-client" className={field} value={form.clientName} onChange={set("clientName")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="eo-phone">Телефон</Label>
                <Input id="eo-phone" type="tel" className={field} value={form.clientPhone} onChange={set("clientPhone")} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="eo-address">Адрес объекта</Label>
            <Input id="eo-address" className={field} value={form.address} onChange={set("address")} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {showMoney && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-amount">Сумма, ₸</Label>
                  <Input id="eo-amount" inputMode="numeric" type="number" min={0} className={field} value={form.amount} onChange={set("amount")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-prepayment">Предоплата, ₸</Label>
                  <Input id="eo-prepayment" inputMode="numeric" type="number" min={0} className={field} value={form.prepayment} onChange={set("prepayment")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="eo-balance">Остаток, ₸</Label>
                  <Input id="eo-balance" className={field} value={formatKzt(balance)} readOnly aria-readonly="true" />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="eo-date">Дата заказа</Label>
              <Input id="eo-date" type="date" className={field} value={form.date} onChange={set("date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-deadline">Дедлайн</Label>
              <Input id="eo-deadline" type="date" className={field} value={form.deadline} onChange={set("deadline")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-closed-at">Дата закрытия объекта</Label>
              <Input id="eo-closed-at" type="date" className={field} value={form.closedAt} onChange={set("closedAt")} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["master", "secondMaster"] as const).map((key, index) => (
              <div className="space-y-1.5" key={key}>
                <Label htmlFor={`eo-${key}`}>{index === 0 ? "Мастер" : "Второй мастер"}</Label>
                <Select value={form[key] || "__none"} onValueChange={(value) => setForm((prev) => ({ ...prev, [key]: value === "__none" ? "" : value }))}>
                  <SelectTrigger id={`eo-${key}`} className={field}><SelectValue placeholder="Не назначен" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Не назначен</SelectItem>
                    {order.masterOptions.filter((m) => m.id !== form[key === "master" ? "secondMaster" : "master"]).map((m) => <SelectItem key={m.id} value={m.id}>{m.fullName}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eo-description">Описание</Label>
            <Textarea id="eo-description" rows={3} className="text-base" value={form.description} onChange={set("description")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eo-comment">Комментарий</Label>
            <Textarea id="eo-comment" rows={3} className="text-base" value={form.comment} onChange={set("comment")} />
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" size="lg" className="h-12" disabled={pending} onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" size="lg" className="h-12" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
