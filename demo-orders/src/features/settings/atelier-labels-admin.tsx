"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_ATELIER_LABELS,
  ATELIER_LABEL_FIELDS,
} from "@/lib/domain/atelier-labels";
import type { AtelierLabels, AtelierServicePrices } from "@/types";

type PriceKey = Exclude<keyof AtelierServicePrices, "companyId">;

export function AtelierLabelsAdmin({
  labels: initialLabels,
  servicePrices: initialPrices,
  canWrite,
}: {
  labels: AtelierLabels;
  servicePrices: AtelierServicePrices;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [labels, setLabels] = useState(initialLabels);
  const [prices, setPrices] = useState(initialPrices);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      const res = await fetch("/api/atelier/labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels, servicePrices: prices }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setLabels(data.labels);
      setPrices(data.servicePrices);
      toast.success("Названия и ставки сохранены");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  const priceFields: { key: PriceKey; label: string }[] = [
    { key: "sewingSalePerMeter", label: `${labels["sewing.title"]}: цена за п.м.` },
    { key: "sewingCostPerMeter", label: `${labels["sewing.title"]}: себестоимость за п.м.` },
    { key: "tapeSalePerMeter", label: `${labels["sewing.tape"]}: цена за п.м.` },
    { key: "tapeCostPerMeter", label: `${labels["sewing.tape"]}: себестоимость за п.м.` },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Названия этапов и работ</h2>
        <p className="text-sm text-muted-foreground">
          Используются в калькуляторе, итогах и новых КП. В уже сохранённых КП
          остаются названия на момент создания.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-3">
        {ATELIER_LABEL_FIELDS.map(({ key, hint }) => (
          <div key={key}>
            <Label htmlFor={`lbl-${key}`}>{hint}</Label>
            <div className="flex gap-1">
              <Input
                id={`lbl-${key}`}
                value={labels[key]}
                maxLength={80}
                disabled={!canWrite}
                onChange={(e) => setLabels((l) => ({ ...l, [key]: e.target.value }))}
              />
              {canWrite && labels[key] !== DEFAULT_ATELIER_LABELS[key] && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Вернуть по умолчанию"
                  title={`По умолчанию: ${DEFAULT_ATELIER_LABELS[key]}`}
                  onClick={() =>
                    setLabels((l) => ({ ...l, [key]: DEFAULT_ATELIER_LABELS[key] }))
                  }
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Ставки пошива и монтажной ленты</h3>
        <p className="text-sm text-muted-foreground">
          Подставляются в новые позиции пошива, в расчёте их можно поправить.
        </p>
      </div>
      <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        {priceFields.map(({ key, label }) => (
          <div key={key}>
            <Label htmlFor={`sp-${key}`}>{label}, ₸</Label>
            <Input
              id={`sp-${key}`}
              type="number"
              min={0}
              value={prices[key] || ""}
              disabled={!canWrite}
              onChange={(e) =>
                setPrices((p) => ({ ...p, [key]: Number(e.target.value) || 0 }))
              }
            />
          </div>
        ))}
      </div>

      {canWrite && (
        <Button type="button" disabled={pending} onClick={() => void save()}>
          Сохранить
        </Button>
      )}
    </section>
  );
}
