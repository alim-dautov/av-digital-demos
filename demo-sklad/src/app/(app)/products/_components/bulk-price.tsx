"use client";
import { useMemo, useState } from "react";
import { ArrowRight, Eye } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, Select, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { money } from "@/lib/format";
import { applyBulkAction, previewBulkAction } from "@/modules/products/actions";
import type { PType } from "./products-table";

type Kind = "percent" | "amount" | "set" | "align" | "fromType";
const KINDS: { k: Kind; label: string; hint: string }[] = [
  { k: "percent", label: "± %", hint: "Изменить на процент" },
  { k: "amount", label: "± ₸", hint: "Прибавить или вычесть сумму" },
  { k: "set", label: "= ₸", hint: "Установить одну цену" },
  { k: "fromType", label: "От цены", hint: "Посчитать от другого типа цены" },
  { k: "align", label: "Цвета", hint: "Выровнять цены у одного товара разных цветов" },
];
type Change = { productId: number; name: string; priceTypeId: number; old: number; new: number };

export function BulkPriceModal({ onClose, types, selection, count, onDone }: {
  onClose: () => void; types: PType[]; selection: { productIds?: number[]; q?: string; folderId?: number }; count: number; onDone: () => void;
}) {
  const [typeIds, setTypeIds] = useState<number[]>(types.filter((t) => !t.isPurchase).map((t) => t.id).slice(0, 1));
  const [kind, setKind] = useState<Kind>("percent");
  const [percent, setPercent] = useState("5");
  const [amount, setAmount] = useState(0);
  const [source, setSource] = useState<number>(types.find((t) => t.isPurchase)?.id ?? types[0]?.id);
  const [align, setAlign] = useState<"max" | "min" | "avg">("max");
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<"nearest" | "up" | "down">("nearest");
  const [preview, setPreview] = useState<Change[] | null>(null);
  const [desc, setDesc] = useState("");
  const { pending, run } = useRun();

  const op = useMemo(() => {
    const pv = Number(percent.replace(",", ".")) || 0;
    switch (kind) {
      case "percent": return { kind, value: pv } as const;
      case "amount": return { kind, value: amount } as const;
      case "set": return { kind, value: amount } as const;
      case "fromType": return { kind, sourceTypeId: source, percent: pv } as const;
      case "align": return { kind, mode: align } as const;
    }
  }, [kind, percent, amount, source, align]);
  const input = { selection, priceTypeIds: typeIds, op, rounding: { step, mode } };
  const autoDesc = useMemo(() => {
    const tn = types.filter((t) => typeIds.includes(t.id)).map((t) => t.name).join(", ");
    const o = kind === "percent" ? `${Number(percent) > 0 ? "+" : ""}${percent}%` : kind === "amount" ? `${amount >= 0 ? "+" : ""}${money(amount)}` : kind === "set" ? `= ${money(amount)}` : kind === "fromType" ? `${types.find((t) => t.id === source)?.name} ${Number(percent) >= 0 ? "+" : ""}${percent}%` : `выравнивание цветов (${align === "max" ? "по макс." : align === "min" ? "по мин." : "по среднему"})`;
    return `${tn}: ${o}${step > 1 ? `, округл. ${step} ₸` : ""}`;
  }, [types, typeIds, kind, percent, amount, source, align, step]);
  const reset = () => setPreview(null);
  const typeName = (id: number) => types.find((t) => t.id === id)?.name ?? "";
  const totalDiff = preview?.reduce((s, c) => s + (c.new - c.old), 0) ?? 0;

  return (
    <Modal open onClose={onClose} title={`Массовая смена цен · ${count} тов.`} size="lg"
      footer={preview ? <>
        <Button onClick={reset}>Назад</Button>
        <Button variant="accent" loading={pending} disabled={!preview.length}
          onClick={() => run(() => applyBulkAction({ input, description: desc || autoDesc }), { success: (d) => `Изменено цен: ${d.count}. Можно откатить.`, onOk: () => { onDone(); onClose(); } })}>
          Применить {preview.length} изм.
        </Button>
      </> : <>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" icon={<Eye className="size-4" />} loading={pending} disabled={!typeIds.length}
          onClick={() => run(() => previewBulkAction(input), { refresh: false, onOk: (d) => setPreview(d.changes) })}>Предпросмотр</Button>
      </>}>
      {!preview ? (
        <div className="flex flex-col gap-5">
          <Field label="Какие цены менять">
            <div className="flex flex-wrap gap-2">
              {types.map((t) => {
                const on = typeIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => setTypeIds(on ? typeIds.filter((x) => x !== t.id) : [...typeIds, t.id])}
                    className={cn("h-10 rounded-xl border px-3 text-sm font-semibold transition-colors", on ? "border-yellow bg-yellow-50 text-navy dark:bg-white/5 dark:text-yellow" : "border-line text-ink-2 hover:border-line-strong")}>
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Как менять">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {KINDS.map((k) => (
                <button key={k.k} type="button" title={k.hint} onClick={() => setKind(k.k)}
                  className={cn("h-11 rounded-xl border text-sm font-bold transition-colors", kind === k.k ? "border-navy bg-navy text-white dark:border-yellow dark:bg-yellow dark:text-navy" : "border-line text-ink-2")}>{k.label}</button>
              ))}
            </div>
            <span className="text-xs text-ink-3">{KINDS.find((k) => k.k === kind)?.hint}</span>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {(kind === "percent" || kind === "fromType") && <Field label="Процент" hint="Отрицательное значение — уменьшить"><Input inputMode="decimal" value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>}
            {kind === "fromType" && <Field label="От какой цены"><Select value={source} onChange={(e) => setSource(Number(e.target.value))}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>}
            {(kind === "amount" || kind === "set") && <Field label={kind === "amount" ? "Сумма (можно со знаком −)" : "Новая цена"}>
              {kind === "amount"
                ? <Input inputMode="decimal" defaultValue="" placeholder="например, -50" onChange={(e) => setAmount(Math.round(Number(e.target.value.replace(",", ".").replace(/\s/g, "")) * 100) || 0)} />
                : <MoneyInput value={amount} onChange={setAmount} />}
            </Field>}
            {kind === "align" && <Field label="Выравнивать по" hint="Товары группируются по названию без слова-цвета: «ПВС 2х1,5 белый» и «ПВС 2х1,5 чёрный»">
              <Select value={align} onChange={(e) => setAlign(e.target.value as typeof align)}><option value="max">максимальной цене</option><option value="min">минимальной цене</option><option value="avg">средней цене</option></Select></Field>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Округлять до">
              <Select value={step} onChange={(e) => setStep(Number(e.target.value))}>{[1, 5, 10, 50, 100, 500, 1000].map((s) => <option key={s} value={s}>{s} ₸</option>)}</Select>
            </Field>
            <Field label="Способ округления">
              <Select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="nearest">математически</option><option value="up">вверх</option><option value="down">вниз</option></Select>
            </Field>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-3"><p className="text-xs text-ink-3">Изменений</p><p className="tnum text-xl font-extrabold">{preview.length}</p></div>
            <div className="rounded-xl border border-line p-3"><p className="text-xs text-ink-3">Сумма разниц</p><p className={cn("tnum text-xl font-extrabold", totalDiff > 0 ? "text-success" : totalDiff < 0 ? "text-danger" : "")}>{money(totalDiff, { sign: true })}</p></div>
          </div>
          <Field label="Описание операции (для журнала и отката)"><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={autoDesc} /></Field>
          {preview.length === 0 ? <p className="py-6 text-center text-sm text-ink-3">Цены не изменятся — проверьте параметры.</p> : (
            <div className="scroll-thin max-h-[45dvh] overflow-y-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs uppercase text-ink-3"><tr><th className="px-3 py-2">Товар</th><th className="px-3 py-2 text-right">Было → стало</th></tr></thead>
                <tbody>
                  {preview.slice(0, 500).map((c) => (
                    <tr key={`${c.productId}-${c.priceTypeId}`} className="border-t border-line">
                      <td className="px-3 py-2"><p className="font-medium leading-snug">{c.name}</p><p className="text-xs text-ink-3">{typeName(c.priceTypeId)}</p></td>
                      <td className="tnum px-3 py-2 text-right whitespace-nowrap"><span className="text-ink-3">{money(c.old)}</span> <ArrowRight className="inline size-3 text-ink-3" /> <b>{money(c.new)}</b>
                        <span className={cn("block text-xs", c.new > c.old ? "text-success" : "text-danger")}>{money(c.new - c.old, { sign: true })}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 500 && <p className="p-3 text-center text-xs text-ink-3">…и ещё {preview.length - 500}</p>}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
