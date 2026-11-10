"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Check, FileUp, Loader2, Save, Send, TrendingDown, TrendingUp, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, Field, Input, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { CpPicker, ProductPicker, backToSearch, focusQty, type CpOption } from "@/components/pickers";
import { uploadFile, type FileRef } from "@/components/file-upload";
import { useRun } from "@/components/use-run";
import { fmtDate, money, num, today } from "@/lib/format";
import { compareAction, createReceiptAction, parseReceiptFileAction, parseReceiptTextAction, updateReceiptAction } from "@/modules/receipts/actions";

export type RLine = { key: string; productId: number; name: string; unit: string; qty: number; price: number; excluded: boolean };
type Parsed = { raw: string; qty: number; unit: string | null; price: number | null; status: string; productId: number | null; candidates: { id: number; name: string; unit: string; score: number }[] };
type Cmp = Record<number, { prevPrice: number; prevDate: string; prevSupplier: string; delta: number; deltaPct: number }>;
export type ReceiptDraft = { id?: number; supplier: CpOption | null; date: string; supplierDocNumber: string; comment: string; posted: boolean; sourceFile: FileRef | null; items: RLine[] };

let seq = 0;
const k = () => `r${++seq}`;

export function ReceiptEditor({ initial, purchaseTypeId }: { initial: ReceiptDraft; purchaseTypeId: number | null }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const set = <K extends keyof ReceiptDraft>(key: K, v: ReceiptDraft[K]) => setD((x) => ({ ...x, [key]: v }));
  const [parsed, setParsed] = useState<Parsed[] | null>(null);
  const [choice, setChoice] = useState<Record<number, number | null>>({});
  const [text, setText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [cmp, setCmp] = useState<Cmp>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const { pending, run } = useRun();
  const parse = useRun();
  const total = d.items.filter((i) => !i.excluded).reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  const future = d.date > today();

  // сравнение с прошлыми закупками
  const sig = d.items.map((i) => `${i.productId}:${i.price}`).join(",");
  useEffect(() => {
    if (!d.items.length) { setCmp({}); return; }
    const t = setTimeout(async () => {
      const r = await compareAction({ items: d.items.map((i) => ({ productId: i.productId, price: i.price })), date: d.date });
      if (r.ok) setCmp(r.data as Cmp);
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, d.date]);

  const onParsed = (r: { rows: Parsed[]; docNumber: string | null; docDate: string | null; supplier: { id: number; name: string } | null; supplierName: string | null; engine: string }) => {
    setParsed(r.rows);
    setChoice(Object.fromEntries(r.rows.map((x, i) => [i, x.status === "matched" ? x.productId : null])));
    if (r.docNumber && !d.supplierDocNumber) set("supplierDocNumber", r.docNumber);
    if (r.docDate && /^\d{4}-\d{2}-\d{2}$/.test(r.docDate)) set("date", r.docDate);
    if (r.supplier && !d.supplier) set("supplier", { id: r.supplier.id, name: r.supplier.name, phone: null, segment: "other", isService: false, clientDebt: 0, managerId: null });
    toast.success(`Распознано строк: ${r.rows.length}${r.engine === "claude" ? " (ИИ)" : ""}${r.supplierName && !r.supplier ? `. Поставщик «${r.supplierName}» не найден — выберите вручную` : ""}`);
  };
  const upload = async (f: File) => {
    setUploading(true);
    try {
      const ref = await uploadFile(f);
      set("sourceFile", ref);
      await parse.run(() => parseReceiptFileAction({ fileId: ref.id }), { refresh: false, onOk: onParsed });
    } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const applyParsed = () => {
    if (!parsed) return;
    const add: RLine[] = [];
    parsed.forEach((r, i) => {
      const c = r.candidates.find((x) => x.id === choice[i]);
      if (c) add.push({ key: k(), productId: c.id, name: c.name, unit: c.unit, qty: r.qty, price: r.price ?? 0, excluded: false });
    });
    set("items", [...d.items, ...add]);
    const left = parsed.filter((_, i) => !choice[i]);
    setParsed(left.length ? left : null);
    setChoice(Object.fromEntries(left.map((_, i) => [i, null])));
  };
  const upd = (key: string, patch: Partial<RLine>) => set("items", d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const save = (posted: boolean) => {
    if (!d.supplier) { toast.error("Выберите поставщика"); return; }
    const data = { supplierId: d.supplier.id, date: d.date, posted, supplierDocNumber: d.supplierDocNumber || null, comment: d.comment, sourceFile: d.sourceFile,
      items: d.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price, excluded: i.excluded })) };
    const ok = (id: number) => router.push(`/receipts/${id}${posted ? "?prices=1" : ""}`);
    if (d.id) run(() => updateReceiptAction({ id: d.id!, data }), { success: posted ? "Приёмка проведена" : "Черновик сохранён", onOk: ok });
    else run(() => createReceiptAction(data), { success: posted ? (future ? "Приёмка проведена — товар будет в остатке с даты поступления" : "Приёмка проведена, остатки обновлены") : "Черновик сохранён", onOk: ok });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title="Поставщик и документ" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2"><CpPicker value={d.supplier} onChange={(v) => set("supplier", v)} kind="supplier" /></div>
            <Field label="Дата поступления" hint={future ? "Будущая дата: товар появится в «Ожидается», в остаток — с этой даты" : undefined}><Input type="date" value={d.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="№ накладной поставщика"><Input value={d.supplierDocNumber} onChange={(e) => set("supplierDocNumber", e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title="Распознать накладную" subtitle="Excel, PDF или фото счёта — позиции сопоставятся с каталогом" />
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={uploading || parse.pending ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />} disabled={uploading || parse.pending} onClick={() => fileRef.current?.click()}>Загрузить файл</Button>
              {d.sourceFile && <a href={`/api/files/${d.sourceFile.id}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-line px-3 text-sm"><FileUp className="size-4 text-ink-3" />{d.sourceFile.name}</a>}
              <input ref={fileRef} type="file" hidden accept=".xlsx,.pdf,image/*,text/plain" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            <details className="group">
              <summary className="cursor-pointer text-sm font-semibold text-info">или вставить текст из накладной</summary>
              <div className="mt-2 flex flex-col gap-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28 font-mono text-[13px]" placeholder={"Кабель ВВГнг 3х2,5 - 500 м по 430\nРозетка Норд двойная 40 шт 900тг"} />
                <Button className="self-start" icon={<Wand2 className="size-4" />} loading={parse.pending} disabled={!text.trim()} onClick={() => parse.run(() => parseReceiptTextAction({ text }), { refresh: false, onOk: onParsed })}>Разобрать текст</Button>
              </div>
            </details>
            {parsed && (
              <div className="animate-in flex flex-col gap-2">
                {parsed.map((r, i) => (
                  <div key={i} className={cn("rounded-xl border p-3", r.status === "matched" ? "border-success/40 bg-success-bg/40" : r.status === "ambiguous" ? "border-warning/40 bg-warning-bg/40" : "border-danger/40 bg-danger-bg/40")}>
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      {r.status === "matched" ? <Check className="size-4 text-success" /> : <AlertTriangle className="size-4 text-warning" />}
                      <span className="min-w-0 flex-1 truncate font-medium">{r.raw}</span>
                      <span className="tnum shrink-0 font-semibold">{num(r.qty)} {r.unit ?? ""} × {r.price != null ? money(r.price) : "—"}</span>
                    </div>
                    {r.candidates.length ? (
                      <Select value={choice[i] ?? ""} onChange={(e) => setChoice({ ...choice, [i]: e.target.value ? Number(e.target.value) : null })} aria-label="Товар">
                        <option value="">— не добавлять / выбрать —</option>{r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.score}%</option>)}
                      </Select>
                    ) : <p className="text-xs text-danger">Нет в каталоге — создайте товар и добавьте через поиск</p>}
                  </div>
                ))}
                <div className="flex gap-2"><Button variant="accent" onClick={applyParsed} disabled={!Object.values(choice).some(Boolean)}>Добавить выбранные</Button><Button variant="ghost" onClick={() => setParsed(null)}>Скрыть</Button></div>
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={`Позиции · ${d.items.length}`} subtitle="снимите галочку, чтобы исключить позицию из приёмки" />
          <div className="p-4 pb-2 sm:px-5"><ProductPicker inputId="receipt-product-search" priceTypeId={purchaseTypeId} onPick={(p) => { set("items", [...d.items, { key: k(), productId: p.id, name: p.name, unit: p.unit, qty: 1, price: purchaseTypeId ? p.prices[purchaseTypeId] ?? 0 : 0, excluded: false }]); focusQty(p.id); }} /></div>
          <ul className="divide-y divide-line">
            {d.items.map((i) => {
              const c = cmp[i.productId];
              return (
                <li key={i.key} className={cn("grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 xl:grid-cols-[auto_minmax(0,1fr)_110px_130px_100px_auto] sm:px-5", i.excluded && "opacity-50")}>
                  <input type="checkbox" className="size-5 accent-[var(--yellow)]" checked={!i.excluded} onChange={(e) => upd(i.key, { excluded: !e.target.checked })} aria-label="Включить позицию" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-snug">{i.name}</p>
                    {c && <p className={cn("flex items-center gap-1 text-xs", c.delta > 0 ? "text-danger" : c.delta < 0 ? "text-success" : "text-ink-3")}>
                      {c.delta > 0 ? <TrendingUp className="size-3.5" /> : c.delta < 0 ? <TrendingDown className="size-3.5" /> : null}
                      {c.delta === 0 ? "как в прошлый раз" : `${c.delta > 0 ? "+" : ""}${c.deltaPct.toFixed(1).replace(".", ",")}%`} · было {money(c.prevPrice)} ({c.prevSupplier}, {fmtDate(c.prevDate)})</p>}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Удалить" className="xl:order-last" onClick={() => set("items", d.items.filter((x) => x.key !== i.key))}><X className="size-4" /></Button>
                  <div className="col-span-3 grid grid-cols-[1fr_1fr_auto] items-center gap-2 xl:grid-cols-[110px_130px_100px]">
                    <div className="flex items-center gap-1.5"><Input type="number" inputMode="decimal" min={0} step="any" value={i.qty} data-qty-for={i.productId ?? undefined} onKeyDown={backToSearch("receipt-product-search")} onChange={(e) => upd(i.key, { qty: Number(e.target.value) || 0 })} className="tnum text-right" aria-label="Количество" /><span className="text-xs text-ink-3">{i.unit}</span></div>
                    <MoneyInput value={i.price} onChange={(v) => upd(i.key, { price: v })} aria-label="Цена закупки" className="text-right" />
                    <p className="tnum text-right text-sm font-bold">{money(Math.round(i.qty * i.price))}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          {!d.items.length && <p className="px-5 pb-5 text-sm text-ink-3">Загрузите накладную или добавьте товары поиском</p>}
        </Card>
      </div>
      <Card className="flex flex-col gap-4 p-4 sm:p-5 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-baseline justify-between"><span className="font-bold">Итого закупка</span><span className="tnum text-[26px] font-extrabold">{money(total)}</span></div>
        {future && <p className="flex gap-2 rounded-xl bg-info-bg px-3 py-2 text-xs text-info"><CalendarClock className="size-4 shrink-0" />Поступление {fmtDate(d.date)} — до этой даты товар виден как «Ожидается»</p>}
        {d.items.some((i) => (cmp[i.productId]?.deltaPct ?? 0) > 5) && <p className="flex gap-2 rounded-xl bg-warning-bg px-3 py-2 text-xs"><AlertTriangle className="size-4 shrink-0 text-warning" />Есть позиции дороже прошлой закупки более чем на 5%</p>}
        <Field label="Комментарий"><Textarea value={d.comment} onChange={(e) => set("comment", e.target.value)} className="min-h-16" /></Field>
        <Button variant="accent" size="lg" icon={<Send className="size-4" />} loading={pending} disabled={!d.items.length || !d.supplier} onClick={() => save(true)}>Провести</Button>
        <Button icon={<Save className="size-4" />} disabled={pending || !d.items.length || !d.supplier} onClick={() => save(false)}>Сохранить черновик</Button>
        {d.posted && <Badge tone="warning">проведена — изменения пересчитают остатки</Badge>}
      </Card>
    </div>
  );
}
