"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search } from "lucide-react";
import type { FurniturePriceCategory, FurniturePriceItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const GROUPS: { label: string; categories: FurniturePriceCategory[] }[] = [
  { label: "Плиты и листы", categories: ["ldsp", "mdf_sheet", "hdf"] },
  { label: "Фасады, за м²", categories: ["facade_sqm"] },
  { label: "Фурнитура", categories: ["hinge", "slide", "lift", "accessory"] },
  { label: "Столешница, кромка и услуги", categories: ["countertop", "edge", "service"] },
];

const UNIT_LABELS: Record<FurniturePriceItem["unit"], string> = {
  sheet: "лист",
  sqm: "м²",
  m: "м",
  pcs: "шт",
};

type Draft = { price: string; active: boolean };

export function FurnitureCatalogAdmin({
  prices,
  canManage,
}: {
  prices: FurniturePriceItem[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const changed = useMemo(
    () =>
      prices.filter((p) => {
        const d = drafts[p.id];
        if (!d) return false;
        return Number(d.price) !== p.price || d.active !== p.active;
      }),
    [drafts, prices],
  );

  const q = query.trim().toLowerCase();
  const visible = (p: FurniturePriceItem) => !q || p.name.toLowerCase().includes(q);

  async function save() {
    if (!canManage || changed.length === 0) return;
    setPending(true);
    try {
      const res = await fetch("/api/furniture/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: changed.map((p) => ({
            id: p.id,
            price: Number(drafts[p.id].price) || 0,
            active: drafts[p.id].active,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      toast.success(`Прайс обновлён: ${changed.length} поз.`);
      setDrafts({});
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-border bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Прайс калькулятора мебели</h2>
          <p className="text-sm text-muted-foreground">
            Себестоимость материалов и фурнитуры. Изменения сразу попадают в новые расчёты.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по прайсу"
              aria-label="Поиск по прайсу"
              className="w-56 pl-9"
            />
          </div>
          {canManage && (
            <Button type="button" disabled={pending || changed.length === 0} onClick={() => void save()}>
              Сохранить{changed.length > 0 ? ` (${changed.length})` : ""}
            </Button>
          )}
        </div>
      </div>

      {GROUPS.map((g) => {
        const items = prices.filter((p) => g.categories.includes(p.category) && visible(p));
        if (items.length === 0) return null;
        return (
          <div key={g.label}>
            <h3 className="mb-1 text-sm font-medium text-muted-foreground">{g.label}</h3>
            <ul className="divide-y divide-border">
              {items.map((p) => {
                const d = drafts[p.id] ?? { price: String(p.price), active: p.active };
                const dirty = Number(d.price) !== p.price || d.active !== p.active;
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className={cn("min-w-0 flex-1 text-sm", !d.active && "text-muted-foreground line-through")}>
                      {p.name}
                      {p.sheetWidth && (
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          {p.sheetWidth}×{p.sheetHeight}
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        aria-label={`Цена: ${p.name}`}
                        disabled={!canManage}
                        value={d.price}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [p.id]: { ...d, price: e.target.value } }))
                        }
                        className={cn("h-8 w-28 text-right tabular-nums", dirty && "border-primary/60")}
                      />
                      <span className="w-12 text-xs text-muted-foreground">₸/{UNIT_LABELS[p.unit]}</span>
                      <Switch
                        aria-label={`Активна: ${p.name}`}
                        checked={d.active}
                        disabled={!canManage}
                        onCheckedChange={(c) =>
                          setDrafts((prev) => ({ ...prev, [p.id]: { ...d, active: c } }))
                        }
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
