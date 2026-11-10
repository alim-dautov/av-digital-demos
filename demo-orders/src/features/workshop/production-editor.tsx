"use client";

/* Local-storage hydration intentionally updates form state from an external store. */
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clearDraft, readDraft, writeDraft } from "@/lib/client-drafts";
import type { ChecklistItem, OrderStage, ProductionMaterial, StageStatus } from "@/types";

type Field = { key: string; label: string; value: number | null };

export function ProductionEditor({
  orderId,
  roomId,
  collection,
  lineId,
  fields,
  updatedAt,
  draftScope,
}: {
  orderId: string;
  roomId: string;
  collection: "tulle" | "portiere" | "covers" | "pillows" | "cornices" | "rollers";
  lineId: string;
  fields: Field[];
  updatedAt: string;
  draftScope?: string;
}) {
  const router = useRouter();
  const scope = `textile-production:${draftScope ?? orderId}:${roomId}:${collection}:${lineId}`;
  const initial = useMemo(() => Object.fromEntries(fields.map((field) => [field.key, field.value ?? ""])), [fields]);
  const [values, setValues] = useState<Record<string, number | string>>(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const draft = readDraft<{ values: Record<string, number | string>; reason: string }>(scope);
    if (draft) {
      setValues(draft.values);
      setReason(draft.reason);
    }
    setHydrated(true);
  }, [scope]);

  useEffect(() => {
    if (hydrated) writeDraft(scope, { values, reason });
  }, [hydrated, reason, scope, values]);

  async function save() {
    const changes = fields
      .filter((field) => String(values[field.key]) !== String(field.value ?? ""))
      .map((field) => ({
        roomId,
        collection,
        lineId,
        field: field.key,
        value: values[field.key] === "" ? null : Number(values[field.key]),
      }));
    if (!changes.length) {
      toast.info("Изменений нет");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/production-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, expectedUpdatedAt: updatedAt, reason: reason.trim() || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить");
      toast.success("Производственные данные сохранены");
      setReason("");
      clearDraft(scope);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-dashed border-border bg-canvas/60 p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        {fields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{field.label}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={values[field.key]}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
              inputMode="decimal"
            />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs text-muted-foreground">Причина изменения (необязательно)</Label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="Например: уточнение после раскроя" />
        </div>
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Сохранить
        </Button>
      </div>
    </div>
  );
}

type OperationalDraft = {
  stages: OrderStage[];
  checklist: ChecklistItem[];
  materials: ProductionMaterial[];
  comment: string;
  reason: string;
};

const STAGE_STATUSES: { value: StageStatus; label: string }[] = [
  { value: "pending", label: "Ожидает" },
  { value: "in_progress", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "blocked", label: "Заблокирован" },
];

export function ProductionOperationsEditor({
  orderId,
  updatedAt,
  stages: initialStages,
  checklist: initialChecklist,
  materials: initialMaterials,
  comment: initialComment,
  draftScope,
}: {
  orderId: string;
  updatedAt: string;
  stages: OrderStage[];
  checklist: ChecklistItem[];
  materials: ProductionMaterial[];
  comment: string | null;
  draftScope?: string;
}) {
  const router = useRouter();
  const scope = `operational-production:${draftScope ?? orderId}`;
  const [stages, setStages] = useState(initialStages);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [materials, setMaterials] = useState(initialMaterials);
  const [comment, setComment] = useState(initialComment ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const draft = readDraft<OperationalDraft>(scope);
    if (draft) {
      setStages(draft.stages);
      setChecklist(draft.checklist);
      setMaterials(draft.materials);
      setComment(draft.comment);
      setReason(draft.reason);
    }
    setHydrated(true);
  }, [scope]);

  useEffect(() => {
    if (hydrated) writeDraft(scope, { stages, checklist, materials, comment, reason });
  }, [checklist, comment, hydrated, materials, reason, scope, stages]);

  async function save() {
    const changes = [
      ...stages.flatMap((stage) => {
        const original = initialStages.find((item) => item.id === stage.id);
        if (!original) return [];
        const output: { target: "stage"; id: string; field: "status" | "comment"; value: string | null }[] = [];
        if (stage.status !== original.status) output.push({ target: "stage", id: stage.id, field: "status", value: stage.status });
        if ((stage.comment ?? "") !== (original.comment ?? "")) output.push({ target: "stage", id: stage.id, field: "comment", value: stage.comment ?? null });
        return output;
      }),
      ...checklist.flatMap((item) => {
        const original = initialChecklist.find((entry) => entry.id === item.id);
        if (!original) return [];
        const output: { target: "checklist"; id: string; field: "done" | "quantity" | "comment"; value: string | number | boolean | null }[] = [];
        if (item.done !== original.done) output.push({ target: "checklist", id: item.id, field: "done", value: item.done });
        if (item.quantity !== original.quantity) output.push({ target: "checklist", id: item.id, field: "quantity", value: item.quantity });
        if ((item.comment ?? "") !== (original.comment ?? "")) output.push({ target: "checklist", id: item.id, field: "comment", value: item.comment ?? null });
        return output;
      }),
      ...(comment !== (initialComment ?? "") ? [{ target: "order" as const, field: "productionComment" as const, value: comment || null }] : []),
      ...(JSON.stringify(materials) !== JSON.stringify(initialMaterials) ? [{ target: "materials" as const, field: "list" as const, value: JSON.stringify(materials) }] : []),
    ];
    if (!changes.length) {
      toast.info("Изменений нет");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/orders/${orderId}/production-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes, expectedUpdatedAt: updatedAt, reason: reason.trim() || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить");
      clearDraft(scope);
      setReason("");
      toast.success("Производственные данные сохранены");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 rounded-lg border border-dashed border-border bg-canvas/60 p-4">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Этапы</h3>
        {stages.map((stage) => (
          <div key={stage.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_180px] sm:items-center">
            <div className="min-w-0"><p className="text-sm font-medium">{stage.label}</p><Input value={stage.comment ?? ""} placeholder="Комментарий по этапу" onChange={(event) => setStages((items) => items.map((item) => item.id === stage.id ? { ...item, comment: event.target.value } : item))} /></div>
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={stage.status} onChange={(event) => setStages((items) => items.map((item) => item.id === stage.id ? { ...item, status: event.target.value as StageStatus } : item))}>
              {STAGE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Чек-лист и факт</h3>
        {checklist.map((item) => (
          <div key={item.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[auto_1fr_110px] sm:items-center">
            <input type="checkbox" checked={item.done} aria-label={`Готово: ${item.name}`} onChange={(event) => setChecklist((items) => items.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry))} />
            <div className="min-w-0"><p className="text-sm font-medium">{item.name}</p><Input value={item.comment ?? ""} placeholder="Комментарий" onChange={(event) => setChecklist((items) => items.map((entry) => entry.id === item.id ? { ...entry, comment: event.target.value } : entry))} /></div>
            <Input type="number" min="0" step="0.01" value={item.quantity} aria-label={`Количество: ${item.name}`} onChange={(event) => setChecklist((items) => items.map((entry) => entry.id === item.id ? { ...entry, quantity: Number(event.target.value) } : entry))} />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Фактические материалы</h3><Button type="button" variant="outline" size="sm" onClick={() => setMaterials((items) => [...items, { id: `draft-${Date.now()}`, name: "", quantity: 1, unit: "шт", comment: null }])}>Добавить</Button></div>
        {materials.map((material) => (
          <div key={material.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_110px_90px_auto]">
            <Input value={material.name} placeholder="Материал" onChange={(event) => setMaterials((items) => items.map((item) => item.id === material.id ? { ...item, name: event.target.value } : item))} />
            <Input type="number" min="0" step="0.01" value={material.quantity} aria-label="Количество материала" onChange={(event) => setMaterials((items) => items.map((item) => item.id === material.id ? { ...item, quantity: Number(event.target.value) } : item))} />
            <Input value={material.unit} placeholder="Ед." aria-label="Единица измерения" onChange={(event) => setMaterials((items) => items.map((item) => item.id === material.id ? { ...item, unit: event.target.value } : item))} />
            <Button type="button" variant="ghost" size="sm" onClick={() => setMaterials((items) => items.filter((item) => item.id !== material.id))}>Удалить</Button>
          </div>
        ))}
      </div>

      <div className="space-y-2"><Label>Комментарий производства</Label><Textarea value={comment} maxLength={2000} onChange={(event) => setComment(event.target.value)} placeholder="Что важно учесть в работе" /></div>
      <div className="space-y-2"><Label>Причина изменения (необязательно)</Label><Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder="Например: уточнение после замера" /></div>
      <Button type="button" onClick={() => void save()} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Сохранить производство</Button>
    </div>
  );
}
