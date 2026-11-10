"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, MicOff, Save, Trash2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardHeader, Field, Input, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { CpPicker, ProductPicker, StockDot, backToSearch, focusQty, type CpOption, type ProductOption } from "@/components/pickers";
import { matchLines } from "@/lib/search/client";
import { parseList } from "@/modules/orders/parse";
import { useRun } from "@/components/use-run";
import { money, num } from "@/lib/format";
import { createOrderAction, defaultPriceTypeAction, parseOrderTextAction, updateOrderAction } from "@/modules/orders/actions";

export type Line = { key: string; productId: number; name: string; unit: string; stock: number; qty: number; price: number; prices: Record<string, number> };
export type OrderDraft = {
  id?: number; number?: number; counterparty: CpOption | null; priceTypeId: number | null; managerId: number | null; coUserId?: number | null; deliveryDate: string; discountPct: number; comment: string; items: Line[];
};
type ParsedRow = { raw: string; name: string; qty: number; unit: string | null; price: number | null; status: "matched" | "ambiguous" | "not_found"; productId: number | null; candidates: { id: number; name: string; sku: string | null; unit: string; score: number; stock: number; price: number }[] };

const PRODUCT_INPUT = "order-product-search";
let seq = 0;
const k = () => `l${++seq}`;

type SR = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };

export function OrderEditor({ initial, priceTypes, managers }: { initial: OrderDraft; priceTypes: { id: number; name: string }[]; managers: { id: number; name: string }[] }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const set = <K extends keyof OrderDraft>(key: K, v: OrderDraft[K]) => setD((x) => ({ ...x, [key]: v }));
  const [source, setSource] = useState<"manual" | "text" | "voice">("manual");
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [choice, setChoice] = useState<Record<number, number | null>>({});
  const [listening, setListening] = useState(false);
  const rec = useRef<SR | null>(null);
  const { pending, run } = useRun();
  const parse = useRun();

  const sum = d.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  const total = Math.round(sum * (1 - d.discountPct / 100));
  const short = d.items.filter((i) => i.stock < i.qty);

  const pickCp = async (c: CpOption | null) => {
    set("counterparty", c);
    if (!c) return;
    // клиент выбран — сразу к товарам
    requestAnimationFrame(() => document.getElementById(PRODUCT_INPUT)?.focus());
    if (c.managerId && !d.managerId) set("managerId", c.managerId);
    const r = await defaultPriceTypeAction({ counterpartyId: c.id });
    if (r.ok && r.data && r.data !== d.priceTypeId) changePriceType(r.data, d.items.length > 0 ? "ask" : "yes");
  };
  const changePriceType = (tid: number | null, reprice: "yes" | "no" | "ask") => {
    set("priceTypeId", tid);
    if (!tid || !d.items.length) return;
    const doIt = reprice === "yes" || (reprice === "ask" && confirm("Пересчитать цены позиций по новому типу цены?"));
    if (doIt) setD((x) => ({ ...x, priceTypeId: tid, items: x.items.map((i) => (i.prices[tid] ? { ...i, price: i.prices[tid] } : i)) }));
  };
  const addProduct = (p: ProductOption, qty = 1, price?: number | null) => {
    setD((x) => {
      const ex = x.items.find((i) => i.productId === p.id);
      if (ex) return { ...x, items: x.items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + qty } : i)) };
      return { ...x, items: [...x.items, { key: k(), productId: p.id, name: p.name, unit: p.unit, stock: p.stock, qty, price: price ?? (x.priceTypeId ? p.prices[x.priceTypeId] ?? 0 : 0), prices: p.prices }] };
    });
  };
  const upd = (key: string, patch: Partial<Line>) => set("items", d.items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  // голосовой ввод (Web Speech API, ru-RU)
  const [speechOk, setSpeechOk] = useState(false);
  useEffect(() => setSpeechOk(!!((window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition)), []);
  const toggleVoice = () => {
    if (listening) { rec.current?.stop(); return; }
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) { toast.error("Голосовой ввод не поддерживается этим браузером"); return; }
    const r = new Ctor();
    r.lang = "ru-RU"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript.trim() + "\n";
      // «запятая»/«следующий» как разделитель строк
      add = add.replace(/\s*(запятая|следующ(ий|ая|ее))\s*/gi, "\n");
      if (add) { setText((t) => (t && !t.endsWith("\n") ? t + "\n" : t) + add); setSource("voice"); }
    };
    r.onerror = (e) => { if (e.error !== "no-speech") toast.error(e.error === "not-allowed" ? "Разрешите доступ к микрофону" : "Ошибка распознавания"); };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };
  useEffect(() => () => rec.current?.stop(), []);

  const showParsed = (r: ParsedRow[]) => {
    setParsed(r);
    setChoice(Object.fromEntries(r.map((x, i) => [i, x.status === "matched" ? x.productId : null])));
    if (source === "manual") setSource("text");
  };
  // разбор списка — тем же мгновенным индексом, что и поиск; если он ещё не загружен — на сервере
  const doParse = async () => {
    const lines = parseList(text);
    const res = lines.length ? await matchLines(lines.map((l) => ({ name: l.name })), { cpId: d.counterparty?.id }) : null;
    if (!res) {
      parse.run(() => parseOrderTextAction({ text, priceTypeId: d.priceTypeId }), { refresh: false, onOk: (rows) => showParsed(rows as ParsedRow[]) });
      return;
    }
    showParsed(lines.map((l, i) => ({
      raw: l.raw, name: l.name, qty: l.qty, unit: l.unit, price: l.price, status: res[i].status,
      productId: res[i].status === "matched" ? res[i].candidates[0].id : null,
      candidates: res[i].candidates.map((c) => ({ id: c.id, name: c.name, sku: c.sku, unit: c.unit, score: c.score, stock: c.stock, price: d.priceTypeId ? c.prices[d.priceTypeId] ?? 0 : 0 })),
    })));
  };
  const applyParsed = () => {
    if (!parsed) return;
    let n = 0;
    parsed.forEach((r, i) => {
      const pid = choice[i];
      const c = r.candidates.find((x) => x.id === pid);
      if (!c) return;
      n++;
      addProduct({ id: c.id, name: c.name, sku: c.sku, unit: c.unit, stock: c.stock, prices: d.priceTypeId ? { [d.priceTypeId]: c.price } : {} }, r.qty, r.price != null ? Math.round(r.price * 100) : c.price || undefined);
    });
    toast.success(`Добавлено позиций: ${n}`);
    const left = parsed.filter((_, i) => !choice[i]);
    setParsed(left.length ? left : null);
    setChoice(Object.fromEntries(left.map((_, i) => [i, null])));
    setText(left.map((l) => l.raw).join("\n"));
  };

  const save = () => {
    if (!d.counterparty) { toast.error("Выберите клиента"); return; }
    const data = {
      counterpartyId: d.counterparty.id, priceTypeId: d.priceTypeId, managerId: d.managerId, coUserId: d.coUserId ?? null, deliveryDate: d.deliveryDate || null,
      discountPct: d.discountPct, comment: d.comment, source, items: d.items.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })),
    };
    if (d.id) run(() => updateOrderAction({ id: d.id!, data }), { success: "Заявка сохранена", onOk: (id) => router.push(`/orders/${id}`) });
    else run(() => createOrderAction(data), { success: "Заявка создана", onOk: (id) => router.push(`/orders/${id}`) });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title="Клиент" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2"><CpPicker value={d.counterparty} onChange={pickCp} kind="client" autoFocus={!d.counterparty} /></div>
            <Field label="Тип цены">
              <Select value={d.priceTypeId ?? ""} onChange={(e) => changePriceType(e.target.value ? Number(e.target.value) : null, "ask")}>
                <option value="">— не выбран —</option>{priceTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Дата доставки"><Input type="date" value={d.deliveryDate} onChange={(e) => set("deliveryDate", e.target.value)} /></Field>
            <Field label="Ответственный менеджер">
              <Select value={d.managerId ?? ""} onChange={(e) => set("managerId", e.target.value ? Number(e.target.value) : null)}><option value="">— по клиенту —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            </Field>
            <Field label="Второй сотрудник" hint="собирали заявку вдвоём — бонус пополам (1% → по 0,5%)">
              <Select value={d.coUserId ?? ""} onChange={(e) => set("coUserId", e.target.value ? Number(e.target.value) : null)}><option value="">— нет —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            </Field>
            <Field label="Скидка, %"><Input type="number" min={0} max={100} step="0.5" value={d.discountPct} onChange={(e) => set("discountPct", Math.min(100, Math.max(0, Number(e.target.value) || 0)))} /></Field>
          </div>
        </Card>

        <Card className="overflow-visible">
          <CardHeader title={`Позиции${d.items.length ? ` · ${d.items.length}` : ""}`} subtitle={short.length ? `не хватает на складе: ${short.length}` : undefined} />
          {d.items.length > 0 && (
            <>
              <div className="hidden grid-cols-[28px_minmax(0,1fr)_96px_150px_104px_32px] gap-2 border-b border-line px-4 py-1.5 text-[11px] font-semibold uppercase text-ink-3 sm:grid sm:px-5">
                <span>№</span><span>Товар</span><span className="text-right">Кол-во</span><span className="text-right">Цена</span><span className="text-right">Сумма</span><span />
              </div>
              <ul className="divide-y divide-line">
                {d.items.map((i, n) => (
                  <li key={i.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 px-4 py-1.5 sm:grid-cols-[28px_minmax(0,1fr)_96px_150px_104px_32px] sm:px-5">
                    <span className="tnum hidden text-xs text-ink-3 sm:block">{n + 1}</span>
                    <div className="min-w-0"><p className="text-[13px] font-semibold leading-tight break-words">{i.name}</p><StockDot stock={i.stock} need={i.qty} unit={i.unit} /></div>
                    <Button variant="ghost" size="icon-sm" aria-label="Удалить позицию" onClick={() => set("items", d.items.filter((x) => x.key !== i.key))} className="size-8 justify-self-end sm:order-last"><X className="size-4" /></Button>
                    <div className="col-span-2 grid grid-cols-[88px_minmax(0,1fr)_auto] items-start gap-2 sm:col-span-3 sm:grid-cols-[96px_150px_104px]">
                      <div className="flex items-center gap-1"><Input type="number" inputMode="decimal" enterKeyHint="next" min={0} step="any" value={i.qty} data-qty-for={i.productId} onKeyDown={backToSearch(PRODUCT_INPUT)} onChange={(e) => upd(i.key, { qty: Number(e.target.value) || 0 })} className="tnum h-8 rounded-lg px-2 text-right text-[13px]" aria-label="Количество" /><span className="w-6 shrink-0 text-[11px] text-ink-3">{i.unit}</span></div>
                      <div className="flex flex-col gap-0.5">
                        <MoneyInput value={i.price} onChange={(v) => upd(i.key, { price: v })} aria-label="Цена" className="h-8 rounded-lg text-right text-[13px]" />
                        <LinePrices line={i} types={priceTypes} onPick={(v) => upd(i.key, { price: v })} />
                      </div>
                      <p className="tnum pt-1.5 text-right text-[13px] font-bold">{money(Math.round(i.qty * i.price))}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="border-t border-line p-3 sm:px-5">
            <p className="mb-1.5 text-xs font-semibold text-ink-3">Добавить товар</p>
            <ProductPicker inputId={PRODUCT_INPUT} autoFocus={!!initial.counterparty} cpId={d.counterparty?.id} onPick={(p) => { addProduct(p); focusQty(p.id); }} priceTypeId={d.priceTypeId} />
            {d.items.length === 0 && <p className="pt-2 text-sm text-ink-3">Добавьте товары поиском или списком ниже</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Быстрый ввод списком" subtitle="Вставьте список из WhatsApp или надиктуйте: «кабель ввг 3х2,5 - 100 м», «розетка эверест 10 шт по 450»" />
          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="relative">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={"ВВГ 3х2.5 100м\nПВС 2х1,5 - 50\nгофра 16 x 5 бухт"} className="min-h-32 pr-14 font-mono text-[13px]" />
              {speechOk && (
                <button type="button" onClick={toggleVoice} aria-label={listening ? "Остановить запись" : "Надиктовать"} title={listening ? "Остановить" : "Надиктовать голосом"}
                  className={cn("absolute right-2 top-2 grid size-11 place-items-center rounded-xl transition-colors", listening ? "animate-pulse bg-danger text-white" : "bg-surface-2 text-ink-2 hover:text-ink")}>
                  {listening ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" icon={<Wand2 className="size-4" />} loading={parse.pending} disabled={!text.trim()} onClick={doParse}>Разобрать</Button>
              {text && <Button variant="ghost" onClick={() => { setText(""); setParsed(null); }}>Очистить</Button>}
            </div>
            {parsed && (
              <div className="animate-in flex flex-col gap-2">
                {parsed.map((r, i) => (
                  <div key={i} className={cn("rounded-xl border p-3", r.status === "matched" ? "border-success/40 bg-success-bg/40" : r.status === "ambiguous" ? "border-warning/40 bg-warning-bg/40" : "border-danger/40 bg-danger-bg/40")}>
                    <div className="mb-2 flex items-center gap-2 text-xs">
                      {r.status === "matched" ? <Check className="size-4 text-success" /> : <AlertTriangle className={cn("size-4", r.status === "ambiguous" ? "text-warning" : "text-danger")} />}
                      <span className="font-mono text-ink-2">{r.raw}</span>
                      <span className="tnum ml-auto font-semibold">{num(r.qty)} {r.unit ?? ""}{r.price != null ? ` · ${money(r.price * 100)}` : ""}</span>
                    </div>
                    {r.candidates.length > 0 ? (
                      <Select value={choice[i] ?? ""} onChange={(e) => setChoice({ ...choice, [i]: e.target.value ? Number(e.target.value) : null })} aria-label="Товар">
                        <option value="">{r.status === "not_found" ? "— не найдено, выберите вручную —" : "— выберите товар —"}</option>
                        {r.candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.score}% · ост. {num(c.stock)}</option>)}
                      </Select>
                    ) : <p className="text-sm text-danger">Похожих товаров нет — добавьте через поиск выше</p>}
                  </div>
                ))}
                <Button variant="accent" onClick={applyParsed} disabled={!Object.values(choice).some(Boolean)}>Добавить отмеченные в заявку</Button>
              </div>
            )}
          </div>
        </Card>

      </div>

      <div className="flex flex-col gap-5 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-4 sm:p-5">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><dt className="text-ink-3">Сумма</dt><dd className="tnum font-semibold">{money(sum)}</dd></div>
            {d.discountPct > 0 && <div className="flex justify-between"><dt className="text-ink-3">Скидка {d.discountPct}%</dt><dd className="tnum font-semibold text-danger">−{money(sum - total)}</dd></div>}
            <div className="mt-1 flex items-baseline justify-between border-t border-line pt-3"><dt className="font-bold">Итого</dt><dd className="tnum text-[26px] font-extrabold tracking-tight">{money(total)}</dd></div>
          </dl>
          {short.length > 0 && <p className="mt-3 flex gap-2 rounded-xl bg-warning-bg px-3 py-2 text-xs font-medium text-[#b45309] dark:text-warning"><AlertTriangle className="size-4 shrink-0" />Не хватает: {short.map((s) => s.name).slice(0, 3).join(", ")}{short.length > 3 ? "…" : ""}</p>}
          {d.counterparty && d.counterparty.clientDebt > 0 && <p className="mt-2 text-xs text-ink-3">Текущий долг клиента: <b className="text-danger">{money(d.counterparty.clientDebt)}</b></p>}
          <Field label="Комментарий" className="mt-4"><Textarea value={d.comment} onChange={(e) => set("comment", e.target.value)} className="min-h-20" placeholder="Адрес, время, пожелания" /></Field>
          <Button variant="accent" size="lg" className="mt-4 w-full" icon={<Save className="size-4" />} loading={pending} onClick={save} disabled={!d.counterparty}>{d.id ? "Сохранить заявку" : "Создать заявку"}</Button>
          {source !== "manual" && <p className="mt-2 text-center text-xs text-ink-3"><Badge tone="info">{source === "voice" ? "голосом" : "из текста"}</Badge></p>}
          {d.id && <Button variant="ghost" className="mt-2 w-full" icon={<Trash2 className="size-4" />} onClick={() => router.push(`/orders/${d.id}`)}>Отменить изменения</Button>}
        </Card>
      </div>
    </div>
  );
}

/** Цены товара по типам (как в МойСклад): видно все три, нажатие ставит цену в строку */
function LinePrices({ line, types, onPick }: { line: Line; types: { id: number; name: string }[]; onPick: (v: number) => void }) {
  const list = types.filter((t) => line.prices[t.id] != null);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-x-1.5 text-[10.5px] leading-tight">
      {list.map((t) => {
        const v = line.prices[t.id];
        const on = v === line.price;
        return (
          <button key={t.id} type="button" onClick={() => onPick(v)} title={`${t.name}: ${money(v)}`}
            className={cn("tnum rounded px-0.5", on ? "font-bold text-ink" : "text-ink-3 hover:text-ink")}>{shortType(t.name)} {num(v / 100)}</button>
        );
      })}
    </div>
  );
}
export function shortType(name: string) {
  const w = name.trim().split(/\s+/)[0] ?? name;
  return w.length > 4 ? w.slice(0, 3) + "." : w;
}
