"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Loader2, PackagePlus, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn, formatKzt, generateId, todayDate } from "@/lib/utils";
import type { InventoryCategory, Material } from "@/types";
import { CATEGORY_LABELS } from "@/types";

type Attr = { key: string; name: string; value: string };
type Row = {
  key: string;
  materialId: string;
  quantity: string;
  unitCost: string;
  attrs: Attr[];
  showAttrs: boolean;
};

type QuickForm = {
  rowKey: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  minStock: string;
  unitCost: string;
};

function emptyRow(): Row {
  return { key: generateId("row"), materialId: "", quantity: "", unitCost: "", attrs: [], showAttrs: false };
}

function MaterialPicker({
  materials,
  value,
  onSelect,
  onCreate,
}: {
  materials: Material[];
  value: string;
  onSelect: (m: Material) => void;
  onCreate: (query: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = materials.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Выберите позицию"}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Поиск по названию или артикулу"
            className="w-full border-b border-border bg-transparent px-3 py-2 text-sm outline-none"
          />
          <Command.List className="max-h-64 overflow-y-auto p-1">
            <Command.Empty className="p-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  setOpen(false);
                  onCreate(query);
                }}
              >
                <Plus className="size-4" /> Создать «{query || "новую позицию"}»
              </Button>
            </Command.Empty>
            {materials.map((m) => (
              <Command.Item
                key={m.id}
                value={`${m.name} ${m.sku}`}
                onSelect={() => {
                  onSelect(m);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm data-[selected=true]:bg-muted"
              >
                <Check className={cn("size-4", m.id === value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{m.name}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {m.quantity} {m.unit}
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ReceiptDialog({
  open,
  onOpenChange,
  materials: initialMaterials,
  categories,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  materials: Material[];
  categories: InventoryCategory[];
}) {
  const router = useRouter();
  const [materials, setMaterials] = React.useState(initialMaterials);
  const [syncedMaterials, setSyncedMaterials] = React.useState(initialMaterials);
  if (syncedMaterials !== initialMaterials) {
    setSyncedMaterials(initialMaterials);
    setMaterials(initialMaterials);
  }
  const [rows, setRows] = React.useState<Row[]>([emptyRow()]);
  const [date, setDate] = React.useState(todayDate());
  const [comment, setComment] = React.useState("");
  const [quick, setQuick] = React.useState<QuickForm | null>(null);
  const [pending, setPending] = React.useState(false);
  const materialMap = React.useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitCost) || 0), 0);

  function patchRow(key: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  function startQuickCreate(rowKey: string, name: string) {
    setQuick({
      rowKey,
      name,
      category: categories[0],
      unit: categories[0]?.startsWith("fabric") ? "м.п." : "шт",
      minStock: "",
      unitCost: rows.find((r) => r.key === rowKey)?.unitCost ?? "",
    });
  }

  async function submitQuick() {
    if (!quick) return;
    setPending(true);
    try {
      const res = await fetch("/api/inventory/materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quick.name,
          category: quick.category,
          unit: quick.unit,
          minStock: Number(quick.minStock) || 0,
          unitCost: Number(quick.unitCost) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      const created: Material = data.material;
      setMaterials((ms) => [...ms, created].sort((a, b) => a.name.localeCompare(b.name, "ru")));
      patchRow(quick.rowKey, {
        materialId: created.id,
        unitCost: quick.unitCost || String(created.unitCost || ""),
      });
      toast.success(`Позиция «${created.name}» создана и добавлена в приход`);
      setQuick(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const filled = rows.filter((r) => r.materialId);
    if (!filled.length) {
      toast.error("Добавьте хотя бы одну позицию");
      return;
    }
    const invalid = filled.find((r) => !(Number(r.quantity) > 0) || r.unitCost === "");
    if (invalid) {
      toast.error(`Укажите количество и закупочную цену для «${materialMap.get(invalid.materialId)?.name}»`);
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          comment: comment || null,
          lines: filled.map((r) => ({
            materialId: r.materialId,
            quantity: Number(r.quantity),
            unitCost: Number(r.unitCost) || 0,
            attributes: Object.fromEntries(
              r.attrs.filter((a) => a.name.trim() && a.value.trim()).map((a) => [a.name.trim(), a.value.trim()]),
            ),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      toast.success(`Приход оформлен: ${filled.length} поз. на ${formatKzt(data.total)}`);
      setRows([emptyRow()]);
      setComment("");
      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Приход товара</DialogTitle>
          <DialogDescription>
            Несколько позиций в одном приходе. Нет нужной позиции — нажмите «+», она сразу попадёт в приход.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div>
              <Label htmlFor="rc-date">Дата</Label>
              <Input id="rc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="rc-comment">Поставщик / комментарий</Label>
              <Input id="rc-comment" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_110px_140px_110px_72px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
              <span>Наименование</span>
              <span>Количество</span>
              <span>Закупочная цена, ₸</span>
              <span className="text-right">Сумма</span>
              <span />
            </div>
            {rows.map((row) => {
              const m = materialMap.get(row.materialId);
              const sum = (Number(row.quantity) || 0) * (Number(row.unitCost) || 0);
              return (
                <div key={row.key} className="rounded-lg border border-border p-2">
                  <div className="grid gap-2 md:grid-cols-[1fr_110px_140px_110px_72px] md:items-center">
                    <div className="flex gap-1">
                      <div className="min-w-0 flex-1">
                        <MaterialPicker
                          materials={materials}
                          value={row.materialId}
                          onSelect={(mat) =>
                            patchRow(row.key, {
                              materialId: mat.id,
                              unitCost: row.unitCost || (mat.unitCost ? String(mat.unitCost) : ""),
                            })
                          }
                          onCreate={(q) => startQuickCreate(row.key, q)}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        aria-label="Новая позиция"
                        title="Новая позиция"
                        onClick={() => startQuickCreate(row.key, "")}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    <div className="relative">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        placeholder="Кол-во"
                        aria-label="Количество"
                        value={row.quantity}
                        onChange={(e) => patchRow(row.key, { quantity: e.target.value })}
                        className="pr-10"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {m?.unit ?? ""}
                      </span>
                    </div>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="Цена за ед."
                      aria-label="Закупочная цена"
                      value={row.unitCost}
                      onChange={(e) => patchRow(row.key, { unitCost: e.target.value })}
                    />
                    <p className="text-right text-sm tabular-nums">{formatKzt(sum)}</p>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Доп. параметры"
                        title="Доп. параметры"
                        className={cn(row.showAttrs && "bg-muted")}
                        onClick={() =>
                          patchRow(row.key, {
                            showAttrs: !row.showAttrs,
                            attrs: row.attrs.length ? row.attrs : [{ key: generateId("a"), name: "", value: "" }],
                          })
                        }
                      >
                        <SlidersHorizontal className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Удалить строку"
                        disabled={rows.length === 1}
                        onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>

                  {row.showAttrs && (
                    <div className="mt-2 space-y-2 border-t border-border pt-2">
                      {row.attrs.map((a) => (
                        <div key={a.key} className="grid grid-cols-[1fr_1fr_36px] gap-2">
                          <Input
                            placeholder="Параметр (цвет, ширина рулона…)"
                            value={a.name}
                            onChange={(e) =>
                              patchRow(row.key, {
                                attrs: row.attrs.map((x) => (x.key === a.key ? { ...x, name: e.target.value } : x)),
                              })
                            }
                          />
                          <Input
                            placeholder="Значение"
                            value={a.value}
                            onChange={(e) =>
                              patchRow(row.key, {
                                attrs: row.attrs.map((x) => (x.key === a.key ? { ...x, value: e.target.value } : x)),
                              })
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Удалить параметр"
                            onClick={() => patchRow(row.key, { attrs: row.attrs.filter((x) => x.key !== a.key) })}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patchRow(row.key, { attrs: [...row.attrs, { key: generateId("a"), name: "", value: "" }] })
                        }
                      >
                        <Plus className="size-4" /> Параметр
                      </Button>
                    </div>
                  )}

                  {quick?.rowKey === row.key && (
                    <div className="mt-2 grid gap-2 rounded-md border border-primary/40 bg-primary/5 p-3 sm:grid-cols-2 lg:grid-cols-5">
                      <p className="flex items-center gap-2 text-sm font-medium sm:col-span-2 lg:col-span-5">
                        <PackagePlus className="size-4" /> Новая позиция
                      </p>
                      <div className="lg:col-span-2">
                        <Label>Наименование</Label>
                        <Input
                          autoFocus
                          value={quick.name}
                          maxLength={120}
                          onChange={(e) => setQuick((q) => q && { ...q, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Категория</Label>
                        <Select
                          value={quick.category}
                          onValueChange={(v) => setQuick((q) => q && { ...q, category: v as InventoryCategory })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((c) => (
                              <SelectItem key={c} value={c}>
                                {CATEGORY_LABELS[c]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Единица</Label>
                        <Input
                          value={quick.unit}
                          maxLength={20}
                          onChange={(e) => setQuick((q) => q && { ...q, unit: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Мин. остаток</Label>
                        <Input
                          type="number"
                          min={0}
                          value={quick.minStock}
                          onChange={(e) => setQuick((q) => q && { ...q, minStock: e.target.value })}
                        />
                      </div>
                      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-5">
                        <Button type="button" variant="ghost" onClick={() => setQuick(null)}>
                          Отмена
                        </Button>
                        <Button type="button" disabled={pending || !quick.name.trim()} onClick={() => void submitQuick()}>
                          Создать и добавить
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <Button type="button" variant="outline" className="w-full" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
              <Plus className="size-4" /> Добавить строку
            </Button>
          </div>

          <DialogFooter className="items-center gap-3 border-t border-border pt-4">
            <p className="mr-auto text-sm">
              Итого по приходу: <span className="font-semibold tabular-nums">{formatKzt(total)}</span>
            </p>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Оформить приход
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
