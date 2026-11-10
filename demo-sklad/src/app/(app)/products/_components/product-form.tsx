"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { Button, Card, CardHeader, Checkbox, Field, Input, MoneyInput, Select, Textarea } from "@/components/ui";
import { Attachments, type FileRef } from "@/components/file-upload";
import { useRun } from "@/components/use-run";
import { createProductAction, deleteProductsAction, updateProductAction } from "@/modules/products/actions";

export type ProductData = {
  id?: number; name: string; sku: string | null; barcode: string | null; unit: string; description: string; folderId: number | null;
  minStock: number; active: boolean; photos: FileRef[]; prices: Record<string, number>;
};
type PT = { id: number; name: string; isPurchase: boolean };
type Folder = { id: number; name: string; parentId: number | null };
const UNITS = ["шт", "м", "бухта", "кг", "уп", "компл", "рул", "пар"];

export function ProductForm({ initial, types, folders, edit }: { initial: ProductData; types: PT[]; folders: Folder[]; edit: boolean }) {
  const [f, setF] = useState(initial);
  const set = <K extends keyof ProductData>(k: K, v: ProductData[K]) => setF((x) => ({ ...x, [k]: v }));
  const router = useRouter();
  const { pending, run } = useRun();
  const path = (id: number): string => { const x = folders.find((y) => y.id === id); return x ? (x.parentId ? `${path(x.parentId)} / ${x.name}` : x.name) : ""; };
  const save = () => {
    const data = { ...f, sku: f.sku || null, barcode: f.barcode || null };
    if (f.id) run(() => updateProductAction({ id: f.id!, data }), { success: "Сохранено" });
    else run(() => createProductAction(data), { success: "Товар создан", onOk: (p) => router.replace(`/products/${p.id}`) });
  };
  const purchase = types.find((t) => t.isPurchase);
  const margin = (tid: number) => {
    if (!purchase || tid === purchase.id) return null;
    const c = f.prices[purchase.id] ?? 0, v = f.prices[tid] ?? 0;
    if (!c || !v) return null;
    const f1 = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");
    return `маржа ${f1(((v - c) / v) * 100)}% · наценка ${f1(((v - c) / c) * 100)}%`;
  };
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Card>
        <CardHeader title="Основное" />
        <fieldset disabled={!edit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Название" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} required placeholder="Кабель ВВГнг-LS 3х2,5" /></Field>
          <Field label="Артикул"><Input value={f.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></Field>
          <Field label="Штрихкод"><Input value={f.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} inputMode="numeric" /></Field>
          <Field label="Единица">
            <Select value={f.unit} onChange={(e) => set("unit", e.target.value)}>{[...new Set([f.unit, ...UNITS])].map((u) => <option key={u}>{u}</option>)}</Select>
          </Field>
          <Field label="Папка">
            <Select value={f.folderId ?? ""} onChange={(e) => set("folderId", e.target.value ? Number(e.target.value) : null)}>
              <option value="">— без папки —</option>
              {folders.map((x) => <option key={x.id} value={x.id}>{path(x.id)}</option>)}
            </Select>
          </Field>
          <Field label="Минимальный остаток" hint="Ниже — товар попадёт в отчёт «Заканчивается»"><Input type="number" min={0} step="any" value={f.minStock} onChange={(e) => set("minStock", Number(e.target.value) || 0)} /></Field>
          <div className="flex items-end"><Checkbox checked={f.active} onChange={(v) => set("active", v)} label="Активен (показывать в заявках и прайсах)" /></div>
          <Field label="Описание" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        </fieldset>
      </Card>
      <Card>
        <CardHeader title="Цены" subtitle="Все суммы в тенге. История изменений сохраняется." />
        <fieldset disabled={!edit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          {types.map((t) => {
            const m = margin(t.id);
            return (
              <Field key={t.id} label={<>{t.name}{t.isPurchase && <span className="ml-1 text-xs font-medium text-warning">· закупочная</span>}</>}
                hint={m ?? undefined}>
                <MoneyInput value={f.prices[t.id] ?? 0} onChange={(v) => set("prices", { ...f.prices, [t.id]: v })} />
              </Field>
            );
          })}
        </fieldset>
      </Card>
      <Card>
        <CardHeader title="Фото" />
        <div className="p-4 sm:p-5">{edit ? <Attachments value={f.photos} onChange={(v) => set("photos", v)} images max={8} label="Добавить фото" /> : f.photos.length ? <Attachments value={f.photos} onChange={() => {}} images max={0} /> : <p className="text-sm text-ink-3">Нет фото</p>}</div>
      </Card>
      {edit && (
        <div className="safe-bottom sticky bottom-[72px] z-20 -mx-4 flex gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4">
          {f.id && <Button type="button" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} disabled={pending}
            onClick={() => confirm("Удалить товар?") && run(() => deleteProductsAction({ ids: [f.id!] }), { success: "Удалено", onOk: () => router.replace("/products") })}>Удалить</Button>}
          <Button type="submit" variant="accent" className="ml-auto" loading={pending} icon={<Save className="size-4" />}>Сохранить</Button>
        </div>
      )}
    </form>
  );
}
