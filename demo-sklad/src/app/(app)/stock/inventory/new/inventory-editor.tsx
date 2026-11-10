"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Send, Save, X } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, Textarea, cn } from "@/components/ui";
import { ProductPicker, backToSearch, focusQty } from "@/components/pickers";
import { useRun } from "@/components/use-run";
import { num, today } from "@/lib/format";
import { createInventoryAction } from "@/modules/inventory/actions";

type L = { productId: number; name: string; unit: string; expected: number; actual: number };

export function InventoryEditor() {
  const router = useRouter();
  const [date, setDate] = useState(today());
  const [comment, setComment] = useState("");
  const [items, setItems] = useState<L[]>([]);
  const { pending, run } = useRun();
  const save = (post: boolean) => run(() => createInventoryAction({ date, comment, post, items: items.map((i) => ({ productId: i.productId, actual: i.actual })) }),
    { success: post ? "Инвентаризация проведена, остатки скорректированы" : "Черновик сохранён", onOk: (id) => router.push(`/stock/inventory/${id}`) });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-w-0">
        <CardHeader title={`Позиции · ${items.length}`} subtitle="найдите товар и введите фактическое количество" />
        <div className="p-4 pb-2 sm:px-5"><ProductPicker inputId="inventory-product-search" autoFocus onPick={(p) => { if (!items.some((i) => i.productId === p.id)) setItems([{ productId: p.id, name: p.name, unit: p.unit, expected: p.stock, actual: Math.max(0, p.stock) }, ...items]); focusQty(p.id); }} /></div>
        <ul className="divide-y divide-line">
          {items.map((i) => {
            const d = i.actual - i.expected;
            return (
              <li key={i.productId} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_90px_120px_80px_auto] sm:px-5">
                <p className="text-sm font-semibold">{i.name}</p>
                <Button variant="ghost" size="icon-sm" aria-label="Убрать" className="sm:order-last" onClick={() => setItems(items.filter((x) => x.productId !== i.productId))}><X className="size-4" /></Button>
                <p className="tnum text-xs text-ink-3 sm:text-right">учёт: {num(i.expected)} {i.unit}</p>
                <Input type="number" inputMode="decimal" min={0} step="any" value={i.actual} aria-label="Факт" className="tnum text-right" data-qty-for={i.productId} onKeyDown={backToSearch("inventory-product-search")}
                  onChange={(e) => setItems(items.map((x) => (x.productId === i.productId ? { ...x, actual: Math.max(0, Number(e.target.value) || 0) } : x)))} />
                <p className={cn("tnum text-right text-sm font-bold", d < 0 ? "text-danger" : d > 0 ? "text-success" : "text-ink-3")}>{d > 0 ? "+" : ""}{num(d)}</p>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card className="flex flex-col gap-4 self-start p-4 sm:p-5">
        <Field label="Дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Комментарий"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-16" /></Field>
        <p className="text-xs text-ink-3">Учётный остаток зафиксируется на дату документа при сохранении.</p>
        <Button variant="accent" icon={<Send className="size-4" />} loading={pending} disabled={!items.length} onClick={() => save(true)}>Провести</Button>
        <Button icon={<Save className="size-4" />} disabled={pending || !items.length} onClick={() => save(false)}>Сохранить черновик</Button>
      </Card>
    </div>
  );
}
