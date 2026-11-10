"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeftRight, Loader2, Package, PackagePlus } from "lucide-react";
import { ReceiptDialog } from "./receipt-dialog";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { MobileList, MobileListItem } from "@/components/ui/mobile-list";
import { cn, formatDateRu, formatKzt } from "@/lib/utils";
import type {
  InventoryCategory,
  InventoryMovement,
  Material,
  MovementType,
} from "@/types";
import { CATEGORY_LABELS } from "@/types";

const MOVEMENT_LABELS: Record<MovementType, string> = {
  in: "Приход",
  out: "Расход",
  transfer: "Перемещение",
  adjustment: "Корректировка",
};

const FURNITURE_CATEGORIES: InventoryCategory[] = [
  "hardware",
  "sheet",
  "consumables",
  "machine",
];
const FABRIC_CATEGORIES: InventoryCategory[] = [
  "fabric_portiere",
  "fabric_tulle",
  "sewing_hardware",
  "cornice",
  "roman_mechanism",
];

type StockSummary = {
  totalSkus: number;
  lowStockCount: number;
  totalValue: number;
  byCategory: Record<InventoryCategory, { count: number; value: number }>;
};

type InventoryViewProps = {
  materials: Material[];
  lowStock: Material[];
  summary: StockSummary;
  canWrite: boolean;
  canDelete?: boolean;
  textiles?: boolean;
  movements?: InventoryMovement[];
};

function movementSign(type: MovementType): string {
  if (type === "out") return "−";
  if (type === "in") return "+";
  return "";
}

function stockPercent(m: Material) {
  if (m.minStock <= 0) return m.quantity > 0 ? 100 : 0;
  return Math.min(100, Math.round((m.quantity / (m.minStock * 2)) * 100));
}

function CorniceRemnants({ materials }: { materials: Material[] }) {
  const rows = materials
    .map((material) => ({
      material,
      length: Number(material.attributes?.lengthM ?? ""),
    }))
    .filter((row) => row.material.quantity > 0 && row.length >= 1)
    .sort((a, b) => b.length - a.length || a.material.name.localeCompare(b.material.name, "ru"));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Хлыстов длиннее метра на складе нет.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-panel p-4">
      <h2 className="text-sm font-semibold">Остатки карнизов от 1 м</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <li key={row.material.id} className="flex justify-between gap-3">
            <span>{row.material.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {row.length} м · {row.material.quantity} {row.material.unit}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MaterialsTable({ materials, selected = [], onToggle }: {
  materials: Material[];
  selected?: string[];
  onToggle?: (id: string) => void;
}) {
  const selection = (m: Material) => onToggle ? (
    <Checkbox checked={selected.includes(m.id)} onCheckedChange={() => onToggle(m.id)}
      aria-label={`Выбрать ${m.name}`} />
  ) : null;
  if (materials.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-panel">
        <EmptyState compact icon={Package} title="Нет позиций в этой категории" />
      </div>
    );
  }

  return (
    <>
    <MobileList aria-label="Материалы">
      {materials.map((m) => {
        const low = m.quantity <= m.minStock;
        return (
          <MobileListItem
            key={m.id}
            title={onToggle ? <span className="inline-flex items-center gap-2">{selection(m)}{m.name}</span> : m.name}
            subtitle={<span className="font-mono">{m.sku}</span>}
            meta={
              <div className="flex items-center gap-2">
                <Progress
                  value={stockPercent(m)}
                  aria-label={`Запас ${m.name}`}
                  className={cn("h-1.5 w-16 shrink-0", low && "[&_[data-state]]:bg-warning")}
                />
                <span className={cn(low && "font-medium text-warning")}>
                  {m.quantity} {m.unit}
                </span>
                <span>мин. {m.minStock}</span>
              </div>
            }
            value={formatKzt(m.quantity * m.unitCost)}
            valueMeta={low ? <span className="text-warning">Мало</span> : undefined}
          />
        );
      })}
    </MobileList>
    <Card className="hidden md:block">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              {onToggle && <TableHead className="w-10"><span className="sr-only">Выбор</span></TableHead>}
              <TableHead>Наименование</TableHead>
              <TableHead>Артикул</TableHead>
              <TableHead className="text-right">Остаток</TableHead>
              <TableHead className="text-right">Минимум</TableHead>
              <TableHead>Запас</TableHead>
              <TableHead className="text-right">Стоимость</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {materials.map((m) => {
              const low = m.quantity <= m.minStock;
              return (
                <TableRow key={m.id}>
                  {onToggle && <TableCell>{selection(m)}</TableCell>}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{m.name}</span>
                      {low && (
                        <Badge variant="warning">Мало</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.sku}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.quantity} {m.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.minStock} {m.unit}
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <Progress
                      value={stockPercent(m)}
                      aria-label={`Запас ${m.name}`}
                      className={cn(low && "[&_[data-state]]:bg-warning")}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatKzt(m.quantity * m.unitCost)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    </>
  );
}

export function InventoryView({
  materials,
  lowStock,
  summary,
  canWrite,
  canDelete = false,
  textiles,
  movements = [],
}: InventoryViewProps) {
  const router = useRouter();
  const CATEGORIES = textiles
    ? [...FABRIC_CATEGORIES, ...FURNITURE_CATEGORIES]
    : FURNITURE_CATEGORIES;
  const defaultTab = textiles ? "fabric_portiere" : "hardware";
  const [category, setCategory] = React.useState(defaultTab);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [deleteIds, setDeleteIds] = React.useState<string[]>([]);
  const [deleteAll, setDeleteAll] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const visible = materials.filter((m) => m.category === category);
  const visibleSelected = visible.filter((m) => selected.includes(m.id)).map((m) => m.id);
  const allVisible = visible.length > 0 && visibleSelected.length === visible.length;
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  async function removeMaterials() {
    setDeleting(true);
    try {
      const res = await fetch("/api/inventory/materials", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка удаления");
      toast.success(`Удалено позиций: ${data.count}`);
      setDeleteIds([]);
      setSelected([]);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка сети");
    } finally { setDeleting(false); }
  }
  const materialMap = React.useMemo(
    () => new Map(materials.map((m) => [m.id, m])),
    [materials],
  );
  const [open, setOpen] = React.useState(false);
  const [receiptOpen, setReceiptOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [form, setForm] = React.useState({
    materialId: materials[0]?.id ?? "",
    type: "in" as MovementType,
    quantity: "",
    comment: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: form.materialId,
          type: form.type,
          quantity: Number(form.quantity),
          comment: form.comment || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Не удалось создать движение");
        return;
      }
      toast.success("Движение записано");
      setOpen(false);
      setForm((f) => ({ ...f, quantity: "", comment: "" }));
      router.refresh();
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Склад
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Остатки материалов и движения
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
          <Button onClick={() => setReceiptOpen(true)}>
            <PackagePlus className="size-4" />
            Приход
          </Button>
          <ReceiptDialog
            open={receiptOpen}
            onOpenChange={setReceiptOpen}
            materials={materials}
            categories={CATEGORIES}
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <ArrowLeftRight className="size-4" />
                Движение
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Создать движение</DialogTitle>
                <DialogDescription>
                  Приход, расход, перемещение или корректировка
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Материал</Label>
                  <Select
                    value={form.materialId}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, materialId: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите материал" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.quantity} {m.unit})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Тип</Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, type: v as MovementType }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(MOVEMENT_LABELS) as MovementType[]).map(
                        (t) => (
                          <SelectItem key={t} value={t}>
                            {MOVEMENT_LABELS[t]}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">Количество</Label>
                  <Input
                    id="qty"
                    type="number"
                    step="any"
                    value={form.quantity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, quantity: e.target.value }))
                    }
                    required
                  />
                  {form.type === "adjustment" && (
                    <p className="text-xs text-muted-foreground">
                      Для корректировки можно указать отрицательное значение
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mov-comment">Комментарий</Label>
                  <Textarea
                    id="mov-comment"
                    value={form.comment}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, comment: e.target.value }))
                    }
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={loading || !form.materialId}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Сохранение…
                      </>
                    ) : (
                      "Записать"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Позиций"
          value={summary.totalSkus}
          icon={Package}
        />
        <KpiCard
          label="Низкий остаток"
          value={summary.lowStockCount}
          icon={AlertTriangle}
        />
        <KpiCard
          className="col-span-2 sm:col-span-1"
          label="Стоимость склада"
          value={formatKzt(summary.totalValue)}
        />
      </div>

      {lowStock.length > 0 && (
        <section
          aria-labelledby="low-stock-title"
          className="rounded-lg border border-warning/40 bg-warning/5 p-4"
        >
          <h2
            id="low-stock-title"
            className="flex items-center gap-2 text-sm font-medium text-warning"
          >
            <AlertTriangle className="size-4" aria-hidden />
            Пора дозаказать: {lowStock.length}
          </h2>
          <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {lowStock.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3">
                <span className="truncate text-foreground">{m.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {m.quantity} из {m.minStock} {m.unit}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canDelete && (
        <section className="space-y-3 rounded-lg border p-3" aria-label="Удаление позиций склада">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={allVisible ? true : visibleSelected.length ? "indeterminate" : false}
                disabled={!visible.length || deleting}
                onCheckedChange={() => setSelected(allVisible ? [] : visible.map((m) => m.id))} />
              Выбрать всё в текущей категории ({visible.length})
            </label>
            <Button variant="destructive" disabled={!visibleSelected.length || deleting}
              onClick={() => { setDeleteAll(false); setDeleteIds(visibleSelected); }}>
              Удалить выбранные ({visibleSelected.length})
            </Button>
            <Button variant="outline" disabled={!materials.length || deleting}
              onClick={() => { setDeleteAll(true); setDeleteIds(materials.map((m) => m.id)); }}>
              Удалить весь склад ({materials.length})
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Выбор действует только в текущей категории. «Удалить весь склад» затрагивает все категории.</p>
          <Dialog open={deleteIds.length > 0} onOpenChange={(v) => { if (!v && !deleting) setDeleteIds([]); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Удалить {deleteAll ? "весь склад" : "выбранные позиции"}?</DialogTitle>
                <DialogDescription>
                  Позиций: {deleteIds.length}. {deleteAll ? "Все категории склада Mebel Demo." : "Только выбранные позиции текущей категории."}
                  {" "}Они будут скрыты со склада и из новых приходов/движений. Это архивирование, не списание: история движений, заказы и финансы сохраняются.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" disabled={deleting} onClick={() => setDeleteIds([])}>Отмена</Button>
                <Button variant="destructive" disabled={deleting} onClick={removeMaterials}>
                  {deleting ? "Удаление…" : `Удалить ${deleteIds.length} позиций`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>
      )}
      <Tabs value={category} onValueChange={(value) => { setCategory(value); setSelected([]); }}>
        <TabsList className="h-auto max-w-full justify-start scroll-x">
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {cat === "fabric_portiere" || cat === "fabric_tulle"
                ? cat === "fabric_portiere"
                  ? "Портьеры"
                  : "Тюли"
                : CATEGORY_LABELS[cat]}
              <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                {summary.byCategory[cat]?.count ?? 0}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-4 space-y-4">
            {cat === "cornice" && (
              <CorniceRemnants materials={materials.filter((m) => m.category === "cornice")} />
            )}
            <MaterialsTable
              selected={visibleSelected}
              onToggle={canDelete ? toggle : undefined}
              materials={materials.filter((m) => m.category === cat)}
            />
          </TabsContent>
        ))}
      </Tabs>

      {textiles && movements.length > 0 && (
        <section aria-labelledby="movements-title" className="space-y-3">
          <h2 id="movements-title" className="text-base font-semibold">
            Журнал движения
          </h2>
          <MobileList aria-label="Журнал движения">
            {movements.map((mov) => {
              const mat = materialMap.get(mov.materialId);
              return (
                <MobileListItem
                  key={mov.id}
                  title={mat?.name ?? mov.materialId}
                  subtitle={MOVEMENT_LABELS[mov.type]}
                  meta={formatDateRu(mov.date)}
                  value={`${movementSign(mov.type)}${mov.quantity} ${mov.unit}`}
                  valueMeta={mat ? `остаток ${mat.quantity} ${mat.unit}` : undefined}
                />
              );
            })}
          </MobileList>
        <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Материал</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead className="text-right">Количество</TableHead>
                  <TableHead className="text-right">Закупка</TableHead>
                  <TableHead className="text-right">Остаток</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((mov) => {
                  const mat = materialMap.get(mov.materialId);
                  return (
                    <TableRow key={mov.id}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDateRu(mov.date)}
                      </TableCell>
                      <TableCell>{mat?.name ?? mov.materialId}</TableCell>
                      <TableCell>{MOVEMENT_LABELS[mov.type]}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {movementSign(mov.type)}
                        {mov.quantity} {mov.unit}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {mov.unitCost != null
                          ? `${formatKzt(mov.unitCost)} / ${mov.unit}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {mat ? `${mat.quantity} ${mat.unit}` : "Нет данных"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </section>
      )}
    </div>
  );
}
