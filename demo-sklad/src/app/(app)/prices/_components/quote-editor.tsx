"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EyeOff, Plus, Save, X } from "lucide-react";
import { Button, Card, CardHeader, Checkbox, Field, Input, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { CpPicker, ProductPicker, backToSearch, focusQty, type CpOption } from "@/components/pickers";
import { useRun } from "@/components/use-run";
import { money, roundTenge } from "@/lib/format";
import { saveQuoteAction } from "@/modules/quotes/actions";

export type QLine = { key: string; productId: number | null; name: string; unit: string; qty: number; basePrice: number };
export type QuoteDraft = {
  id: number | null; client: CpOption | null; clientName: string; clientDetails: string; objectName: string; priceTypeId: number | null;
  markupPct: number; validUntil: string; terms: string; isTemplate: boolean; templateName: string; items: QLine[];
};
let n = 0;
const k = () => `q${++n}`;

/** КП: базовые цены + скрытая наценка (вшивается в цену каждой строки, клиент видит только итоговые цены) */
export function QuoteEditor({ initial, types }: { initial: QuoteDraft; types: { id: number; name: string }[] }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const set = <K extends keyof QuoteDraft>(key: K, v: QuoteDraft[K]) => setD((x) => ({ ...x, [key]: v }));
  const { pending, run } = useRun();
  const price = (b: number) => roundTenge(b * (1 + d.markupPct / 100));
  const base = d.items.reduce((s, i) => s + Math.round(i.qty * i.basePrice), 0);
  const total = d.items.reduce((s, i) => s + Math.round(i.qty * price(i.basePrice)), 0);
  const upd = (key: string, p: Partial<QLine>) => set("items", d.items.map((i) => (i.key === key ? { ...i, ...p } : i)));
  const save = () => run(() => saveQuoteAction({ id: d.id, data: {
    counterpartyId: d.client?.id ?? null, clientName: d.client?.name ?? d.clientName, clientDetails: d.clientDetails, objectName: d.objectName, priceTypeId: d.priceTypeId,
    markupPct: d.markupPct, validUntil: d.validUntil || null, terms: d.terms, isTemplate: d.isTemplate, templateName: d.isTemplate ? d.templateName || d.objectName || "Шаблон" : null,
    items: d.items.map((i) => ({ productId: i.productId, name: i.name, unit: i.unit, qty: i.qty, basePrice: i.basePrice })),
  } }), { success: d.isTemplate ? "Шаблон сохранён" : "КП сохранено", onOk: (id) => router.push(`/prices/quotes/${id}`) });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title="Клиент и объект" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2"><CpPicker value={d.client} onChange={(v) => set("client", v)} kind="client" /></div>
            {!d.client && <Field label="или имя клиента"><Input value={d.clientName} onChange={(e) => set("clientName", e.target.value)} placeholder="ТОО «Строй-Монтаж»" /></Field>}
            <Field label="Объект"><Input value={d.objectName} onChange={(e) => set("objectName", e.target.value)} placeholder="ЖК «Алатау», 2 очередь" /></Field>
            <Field label="Реквизиты клиента" className="sm:col-span-2"><Textarea value={d.clientDetails} onChange={(e) => set("clientDetails", e.target.value)} className="min-h-14" placeholder="БИН, адрес, контакт" /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={`Позиции · ${d.items.length}`} subtitle="цены — базовые; клиент увидит цену с наценкой" />
          <div className="flex flex-col gap-2 p-4 pb-2 sm:flex-row sm:px-5">
            <div className="flex-1"><ProductPicker inputId="quote-product-search" cpId={d.client?.id} priceTypeId={d.priceTypeId} onPick={(p) => { set("items", [...d.items, { key: k(), productId: p.id, name: p.name, unit: p.unit, qty: 1, basePrice: d.priceTypeId ? p.prices[d.priceTypeId] ?? 0 : 0 }]); focusQty(p.id); }} /></div>
            <Button variant="ghost" icon={<Plus className="size-4" />} onClick={() => set("items", [...d.items, { key: k(), productId: null, name: "", unit: "шт", qty: 1, basePrice: 0 }])}>Своя строка</Button>
          </div>
          <ul className="divide-y divide-line">
            {d.items.map((i) => (
              <li key={i.key} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-3 xl:grid-cols-[minmax(0,1fr)_90px_60px_120px_110px_auto] xl:items-center sm:px-5">
                {i.productId ? <p className="text-sm font-semibold">{i.name}</p> : <Input value={i.name} onChange={(e) => upd(i.key, { name: e.target.value })} placeholder="Наименование (монтаж, доставка…)" aria-label="Наименование" />}
                <Button variant="ghost" size="icon-sm" aria-label="Убрать" className="xl:order-last" onClick={() => set("items", d.items.filter((x) => x.key !== i.key))}><X className="size-4" /></Button>
                <div className="col-span-2 grid grid-cols-[1fr_70px_1fr] items-center gap-2 xl:contents">
                  <Input type="number" inputMode="decimal" min={0} step="any" value={i.qty} data-qty-for={i.productId ?? undefined} onKeyDown={backToSearch("quote-product-search")} onChange={(e) => upd(i.key, { qty: Number(e.target.value) || 0 })} className="tnum text-right" aria-label="Количество" />
                  {i.productId ? <span className="text-xs text-ink-3">{i.unit}</span> : <Input value={i.unit} onChange={(e) => upd(i.key, { unit: e.target.value })} aria-label="Ед." />}
                  <MoneyInput value={i.basePrice} onChange={(v) => upd(i.key, { basePrice: v })} aria-label="Базовая цена" className="text-right" />
                  <p className="tnum col-span-3 text-right text-sm xl:col-span-1"><span className="text-xs text-ink-3">клиенту </span><b>{money(price(i.basePrice))}</b></p>
                </div>
              </li>
            ))}
          </ul>
          {!d.items.length && <p className="px-5 pb-5 text-sm text-ink-3">Добавьте товары из каталога или свои строки</p>}
        </Card>
        <Card className="p-4 sm:p-5"><Field label="Условия (оплата, доставка, сроки)"><Textarea value={d.terms} onChange={(e) => set("terms", e.target.value)} className="min-h-20" placeholder="Предоплата 50%, доставка по городу бесплатно от 300 000 ₸, срок поставки 3 дня" /></Field></Card>
      </div>
      <Card className="flex flex-col gap-4 self-start p-4 sm:p-5 lg:sticky lg:top-20">
        <Field label="Базовые цены"><Select value={d.priceTypeId ?? ""} onChange={(e) => set("priceTypeId", e.target.value ? Number(e.target.value) : null)}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Наценка, %" hint="не видна клиенту — заложена в цены"><Input type="number" min={0} max={500} step="0.5" value={d.markupPct} onChange={(e) => set("markupPct", Number(e.target.value) || 0)} /></Field>
        <Field label="Действительно до"><Input type="date" value={d.validUntil} onChange={(e) => set("validUntil", e.target.value)} /></Field>
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          <div className="flex justify-between text-ink-3"><span className="flex items-center gap-1"><EyeOff className="size-3.5" />База</span><span className="tnum">{money(base)}</span></div>
          <div className="flex justify-between text-ink-3"><span>Наценка</span><span className="tnum">{money(total - base)}</span></div>
          <div className="mt-1 flex items-baseline justify-between"><b>Клиенту</b><b className="tnum text-xl">{money(total)}</b></div>
        </div>
        <Checkbox checked={d.isTemplate} onChange={(v) => set("isTemplate", v)} label="Сохранить как шаблон" />
        {d.isTemplate && <Input value={d.templateName} onChange={(e) => set("templateName", e.target.value)} placeholder="Название шаблона: «Электрика квартиры 2к»" aria-label="Название шаблона" />}
        <Button variant="accent" size="lg" icon={<Save className="size-4" />} loading={pending} disabled={!d.items.length || d.items.some((i) => !i.name.trim())} onClick={save} className={cn(!d.items.length && "opacity-60")}>Сохранить</Button>
      </Card>
    </div>
  );
}
