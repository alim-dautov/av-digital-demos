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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatDateRu, formatKzt } from "@/lib/utils";
import { CATEGORY_LABELS, PURCHASE_CATEGORY_IDS, type InventoryCategory, type Purchase } from "@/types";
import Link from "next/link";

type DraftLine = {
  name: string;
  category: InventoryCategory;
  quantity: string;
  unit: string;
  price: string;
  lengthM: string;
};

function emptyLine(): DraftLine {
  return {
    name: "",
    category: "sewing_hardware",
    quantity: "",
    unit: "шт",
    price: "",
    lengthM: "",
  };
}

function money(text: string): number {
  const value = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : 0;
}

export function PurchasesView({
  purchases,
  canWrite,
}: {
  purchases: Purchase[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [supplier, setSupplier] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [pending, setPending] = useState(false);

  function patchLine(index: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  async function create() {
    setPending(true);
    try {
      const res = await fetch("/api/purchases", {
        method: "POST",
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
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Не удалось создать накладную");
        return;
      }
      toast.success("Накладная создана");
      router.push(`/purchases/${data.purchase.id}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Закуп</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Накладная поставщика. После проведения позиции приходят на склад.
        </p>
      </header>

      {canWrite && (
        <section className="space-y-4 rounded-xl border border-border bg-panel p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="supplier">Поставщик</Label>
              <Input id="supplier" value={supplier} onChange={(event) => setSupplier(event.target.value)} />
            </div>
            <div>
              <Label htmlFor="purchase-comment">Комментарий</Label>
              <Textarea
                id="purchase-comment"
                value={comment}
                rows={2}
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-6">
                <div className="sm:col-span-2">
                  <Label>Название</Label>
                  <Input value={line.name} onChange={(event) => patchLine(index, { name: event.target.value })} />
                </div>
                <div>
                  <Label>Категория</Label>
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
                </div>
                <div>
                  <Label>Количество</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={line.quantity}
                    onChange={(event) => patchLine(index, { quantity: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Цена, ₸</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={line.price}
                    onChange={(event) => patchLine(index, { price: event.target.value })}
                  />
                </div>
                <div>
                  <Label>Ед.</Label>
                  <Input value={line.unit} onChange={(event) => patchLine(index, { unit: event.target.value })} />
                </div>
                {line.category === "cornice" && (
                  <div>
                    <Label>Длина, м</Label>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={line.lengthM}
                      onChange={(event) => patchLine(index, { lengthM: event.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="w-full" onClick={() => setLines((current) => [...current, emptyLine()])}>
              Добавить позицию
            </Button>
            <Button type="button" className="w-full" onClick={create} disabled={pending}>
              Создать накладную
            </Button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>№</TableHead>
              <TableHead>Поставщик</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>
                  <Link href={`/purchases/${purchase.id}`} className="font-medium text-primary hover:underline">
                    {purchase.number}
                  </Link>
                </TableCell>
                <TableCell>{purchase.supplier}</TableCell>
                <TableCell className="tabular-nums">{formatDateRu(purchase.createdAt)}</TableCell>
                <TableCell>{purchase.status === "posted" ? "Проведена" : "Черновик"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatKzt(purchase.items.reduce((sum, item) => sum + Math.round(item.quantity * item.price), 0))}
                </TableCell>
              </TableRow>
            ))}
            {purchases.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  Накладных ещё нет
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
