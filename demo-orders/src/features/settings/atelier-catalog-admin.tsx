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
import type { AtelierFabric } from "@/types";
import { formatKzt } from "@/lib/utils";

export function AtelierCatalogAdmin({
  fabrics,
  canManage,
}: {
  fabrics: AtelierFabric[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "portiere" as "portiere" | "tulle",
    article: "",
    salePrice: "",
    costPrice: "",
    stock: "",
  });

  async function saveFabric() {
    if (!canManage) return;
    setPending(true);
    try {
      const res = await fetch("/api/atelier/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fabric: {
            name: form.name,
            type: form.type,
            article: form.article,
            salePrice: Number(form.salePrice) || 0,
            costPrice: Number(form.costPrice) || 0,
            stock: Number(form.stock) || 0,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      toast.success("Ткань добавлена");
      setForm({
        name: "",
        type: "portiere",
        article: "",
        salePrice: "",
        costPrice: "",
        stock: "",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Каталог Шторы Демо</h2>
        <p className="text-sm text-muted-foreground">
          Ткани и цены. Остальные прайсы уже в базе и используются калькулятором.
        </p>
      </div>

      <ul className="space-y-2 text-sm">
        {fabrics.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
          >
            <span>
              {f.type === "portiere" ? "Портьера" : "Тюль"}: {f.name} ({f.article})
            </span>
            <span className="tabular-nums text-muted-foreground">
              {formatKzt(f.salePrice)} / м.п. · остаток {f.stock} м
            </span>
          </li>
        ))}
      </ul>

      {canManage && (
        <div className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
          <div>
            <Label>Название</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <Label>Артикул</Label>
            <Input
              value={form.article}
              onChange={(e) =>
                setForm((f) => ({ ...f, article: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Тип</Label>
            <Select
              value={form.type}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  type: v as "portiere" | "tulle",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="portiere">Портьера</SelectItem>
                <SelectItem value="tulle">Тюль</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Цена продажи</Label>
            <Input
              type="number"
              value={form.salePrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, salePrice: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Себестоимость</Label>
            <Input
              type="number"
              value={form.costPrice}
              onChange={(e) =>
                setForm((f) => ({ ...f, costPrice: e.target.value }))
              }
            />
          </div>
          <div>
            <Label>Остаток, м.п.</Label>
            <Input
              type="number"
              value={form.stock}
              onChange={(e) =>
                setForm((f) => ({ ...f, stock: e.target.value }))
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              className="w-full"
              disabled={pending || !form.name || !form.article}
              onClick={() => void saveFabric()}
            >
              Добавить ткань
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
