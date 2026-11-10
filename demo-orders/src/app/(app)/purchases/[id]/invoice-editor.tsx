"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrintButton } from "@/features/proposals/print-button";
import { formatKzt } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PURCHASE_CATEGORY_IDS,
  type InventoryCategory,
  type Purchase,
  type PurchaseItem,
} from "@/types";

type Line = {
  name: string;
  category: InventoryCategory;
  quantity: string;
  unit: string;
  price: string;
  lengthM: string;
};

function money(text: string): number {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

function toLines(items: PurchaseItem[]): Line[] {
  return items.map((item) => ({
    name: item.name,
    category: item.category,
    quantity: item.quantity ? String(item.quantity) : "",
    unit: item.unit,
    price: item.price ? String(item.price) : "",
    lengthM: item.lengthM ? String(item.lengthM) : "",
  }));
}

export function InvoiceEditor({
  purchase,
  companyName,
  canWrite,
}: {
  purchase: Purchase;
  companyName: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const posted = purchase.status === "posted";
  const locked = posted || !canWrite;
  const [supplier, setSupplier] = useState(purchase.supplier);
  const [comment, setComment] = useState(purchase.comment ?? "");
  const [lines, setLines] = useState<Line[]>(toLines(purchase.items));
  const [pending, setPending] = useState(false);

  function patchLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  const total = lines.reduce((sum, line) => sum + Math.round(money(line.quantity) * money(line.price)), 0);

  async function save(post: boolean) {
    setPending(true);
    try {
      const res = await fetch(`/api/purchases/${purchase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplier,
          comment,
          items: lines.map((line) => ({
            name: line.name,
            category: line.category,
            quantity: money(line.quantity),
            unit: line.unit || "шт",
            price: money(line.price),
            lengthM: line.category === "cornice" && line.lengthM ? money(line.lengthM) : null,
          })),
          post,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Не удалось сохранить накладную");
        return;
      }
      toast.success(post ? "Накладная проведена, товар на складе" : "Накладная сохранена");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap gap-2">
        <PrintButton />
        {!locked && (
          <>
            <Button type="button" variant="outline" className="w-full sm:w-auto" disabled={pending} onClick={() => save(false)}>
              Сохранить
            </Button>
            <Button type="button" className="w-full sm:w-auto" disabled={pending} onClick={() => save(true)}>
              Провести на склад
            </Button>
          </>
        )}
      </div>
      <article className="print-area mx-auto max-w-[860px] space-y-5 rounded-xl border border-border bg-white p-6 text-neutral-900 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-neutral-200 pb-4">
          <div>
            <p className="text-sm text-neutral-500">{companyName}</p>
            <h1 className="text-2xl font-semibold">Накладная {purchase.number}</h1>
            <p className="text-sm">{posted ? "Проведена" : "Черновик"}</p>
          </div>
          <p className="text-xl font-semibold tabular-nums">{formatKzt(total)}</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Поставщик</Label>
            <Input value={supplier} disabled={locked} onChange={(event) => setSupplier(event.target.value)} />
          </div>
          <div>
            <Label>Комментарий</Label>
            <Input value={comment} disabled={locked} onChange={(event) => setComment(event.target.value)} />
          </div>
        </div>
        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 border-t border-neutral-200 pt-3 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label>Название</Label>
                <Input value={line.name} disabled={locked} onChange={(event) => patchLine(index, { name: event.target.value })} />
              </div>
              <div>
                <Label>Категория</Label>
                {locked ? (
                  <p className="py-2 text-sm">{CATEGORY_LABELS[line.category]}</p>
                ) : (
                  <Select
                    value={line.category}
                    onValueChange={(value) => patchLine(index, { category: value as InventoryCategory })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PURCHASE_CATEGORY_IDS.map((category) => (
                        <SelectItem key={category} value={category}>
                          {CATEGORY_LABELS[category]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div>
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={line.quantity}
                  disabled={locked}
                  onChange={(event) => patchLine(index, { quantity: event.target.value })}
                />
              </div>
              <div>
                <Label>Цена</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={line.price}
                  disabled={locked}
                  onChange={(event) => patchLine(index, { price: event.target.value })}
                />
              </div>
              <div>
                <Label>Сумма</Label>
                <p className="py-2 text-sm tabular-nums">{formatKzt(Math.round(money(line.quantity) * money(line.price)))}</p>
              </div>
              {line.category === "cornice" && (
                <div>
                  <Label>Длина, м</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={line.lengthM}
                    disabled={locked}
                    onChange={(event) => patchLine(index, { lengthM: event.target.value })}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}
