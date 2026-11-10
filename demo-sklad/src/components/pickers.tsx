"use client";
/**
 * Единые поля выбора с мгновенным поиском: товары, контрагенты, сотрудники, папки.
 * Поиск идёт в Web Worker по индексу в памяти (src/lib/search), на каждый символ, без debounce.
 * Пока индекс не загрузился (первый вход без кэша) — резервный серверный поиск.
 */
import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock, FolderTree, Loader2, Package, Plus, Search, Star, User, UserRound, X } from "lucide-react";
import { cn, fieldBase } from "@/components/ui";
import { money, num } from "@/lib/format";
import { highlight } from "@/lib/search/text";
import { loadClientHistory, recentIds, rememberPick, useInstantSearch, useSearchStatus } from "@/lib/search/client";
import type { CpHit, HitOf, ProductHit, SearchKind, SearchOpts, SimpleHit } from "@/lib/search/types";

export type CpOption = { id: number; name: string; phone: string | null; segment: string; isService: boolean; clientDebt: number; managerId: number | null };
export type ProductOption = { id: number; name: string; sku: string | null; unit: string; stock: number; prices: Record<string, number>; lastPurchases?: { supplierName: string; price: number; date: string }[] };

const toCp = (c: CpHit): CpOption => ({ id: c.id, name: c.name, phone: c.phone, segment: c.segment, isService: c.isService, clientDebt: c.clientDebt, managerId: c.managerId });
const toProduct = (p: ProductHit): ProductOption => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit, stock: p.stock, prices: p.prices });

/** Название с подсветкой совпавших букв */
export const Hl = memo(function Hl({ text, q }: { text: string; q: string }) {
  const segs = useMemo(() => (q.trim() ? highlight(text, q) : [{ t: text, hit: false }]), [text, q]);
  return <>{segs.map((s, i) => (s.hit ? <mark key={i} className="rounded-[3px] bg-yellow/35 px-px text-inherit dark:bg-yellow/30">{s.t}</mark> : <span key={i}>{s.t}</span>))}</>;
});

function useOutside(ref: React.RefObject<HTMLElement | null>, fn: () => void) {
  useEffect(() => {
    const on = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) fn(); };
    document.addEventListener("pointerdown", on);
    return () => document.removeEventListener("pointerdown", on);
  }, [ref, fn]);
}

const GROUP_LABEL = { recent: "Недавние", client: "Брал этот клиент", popular: "Часто берут" } as const;
const GROUP_ICON = { recent: Clock, client: UserRound, popular: Star } as const;

type ComboProps<K extends SearchKind> = {
  kind: K;
  placeholder: string;
  icon: React.ReactNode;
  opts?: SearchOpts;
  rowHeight?: number;
  render: (o: HitOf<K>, q: string, active: boolean) => React.ReactNode;
  onPick: (o: HitOf<K>) => void;
  autoFocus?: boolean;
  inputId?: string;
  clearOnPick?: boolean;
  /** Что показать, если ничего не найдено (например, «Создать товар») */
  empty?: (q: string) => React.ReactNode;
  /** Резервный серверный поиск (пока индекс не загружен) */
  fallback?: (q: string) => Promise<HitOf<K>[]>;
  className?: string;
  /** Поле всегда раскрыто под строкой (раздел «Товары») */
  inline?: boolean;
  onQueryChange?: (q: string) => void;
  initialQ?: string;
};

/** Комбобокс с мгновенным поиском по индексу в воркере */
export function SearchCombo<K extends SearchKind>({ kind, placeholder, icon, opts, rowHeight = 56, render, onPick, autoFocus, inputId, clearOnPick, empty, fallback, className, inline, onQueryChange, initialQ = "" }: ComboProps<K>) {
  const [q, setQ] = useState(initialQ);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [maxH, setMaxH] = useState(360);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const lid = useId();
  const recent = useMemo(() => (open ? recentIds(kind) : []), [open, kind]);
  const s = useInstantSearch(kind, q, { ...opts, recent, enabled: open || inline });
  useOutside(ref, () => setOpen(false));

  // резерв: индекс ещё грузится в первый раз
  const useFallback = !s.ready && !!fallback && q.trim().length >= 2;
  const fb = useQuery({ queryKey: ["pick-fallback", kind, q.trim(), JSON.stringify(opts ?? {})], enabled: useFallback, queryFn: () => fallback!(q.trim()), staleTime: 10_000 });
  const items = (useFallback ? (fb.data ?? []) : s.items) as (HitOf<K> & { group?: keyof typeof GROUP_LABEL })[];
  const shownQ = useFallback ? q : s.resultQ ?? q;

  useEffect(() => { setSel(0); setScroll(0); if (list.current) list.current.scrollTop = 0; }, [shownQ, items.length]);

  // высота списка — до клавиатуры (visualViewport), чтобы результаты не прятались под ней
  useLayoutEffect(() => {
    if (!open && !inline) return;
    const fit = () => {
      const r = input.current?.getBoundingClientRect();
      const vh = window.visualViewport?.height ?? window.innerHeight;
      if (r) setMaxH(Math.max(176, Math.min(inline ? 560 : 380, vh - r.bottom - 12)));
    };
    fit();
    window.visualViewport?.addEventListener("resize", fit);
    window.addEventListener("scroll", fit, { passive: true });
    return () => { window.visualViewport?.removeEventListener("resize", fit); window.removeEventListener("scroll", fit); };
  }, [open, inline]);

  const pick = (o: HitOf<K>) => {
    rememberPick(kind, o.id);
    onPick(o);
    if (clearOnPick) { setQ(""); onQueryChange?.(""); } else setOpen(false);
  };
  const move = (d: number) => {
    setSel((cur) => {
      const n = Math.max(0, Math.min(items.length - 1, cur + d));
      const el = list.current;
      if (el) {
        const top = n * rowHeight, bottom = top + rowHeight;
        if (top < el.scrollTop) el.scrollTop = top;
        else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
      }
      return n;
    });
  };

  // виртуализация: рисуем только видимые строки (+ запас)
  const total = items.length;
  const from = Math.max(0, Math.floor(scroll / rowHeight) - 4);
  const to = Math.min(total, Math.ceil((scroll + maxH) / rowHeight) + 4);
  const visible = open || inline;
  const showEmpty = visible && q.trim() && !useFallback && s.ready && s.resultQ === q && total === 0;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <span className="pointer-events-none absolute left-3 top-[22px] -translate-y-1/2 text-ink-3 [&_svg]:size-4">{icon}</span>
      <input ref={input} id={inputId} value={q} autoFocus={autoFocus} placeholder={placeholder} autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="search"
        role="combobox" aria-expanded={visible} aria-controls={lid} aria-autocomplete="list" aria-activedescendant={visible && items[sel] ? `${lid}-${sel}` : undefined}
        onChange={(e) => { s.markTyped(); setQ(e.target.value); onQueryChange?.(e.target.value); setOpen(true); }}
        onFocus={() => {
          setOpen(true);
          // телефон: поле наверх, чтобы список уместился над клавиатурой
          if (window.innerWidth < 768) setTimeout(() => input.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 250);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); move(1); }
          else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
          else if (e.key === "PageDown") { e.preventDefault(); move(Math.floor(maxH / rowHeight)); }
          else if (e.key === "PageUp") { e.preventDefault(); move(-Math.floor(maxH / rowHeight)); }
          else if (e.key === "Enter" && visible && items[sel]) { e.preventDefault(); pick(items[sel]); }
          else if (e.key === "Escape") { if (q && !open) { setQ(""); onQueryChange?.(""); } setOpen(false); }
        }}
        className={cn(fieldBase, "h-11 scroll-mt-20 pl-9 pr-9 text-[15px] sm:text-sm")} />
      {q ? (
        <button type="button" aria-label="Очистить" onClick={() => { setQ(""); onQueryChange?.(""); input.current?.focus(); }} className="absolute right-1 top-0.5 grid size-10 place-items-center rounded-lg text-ink-3 hover:text-ink"><X className="size-4" /></button>
      ) : (useFallback && fb.isFetching) || (open && s.status.state === "loading") ? <Loader2 className="absolute right-3 top-3.5 size-4 animate-spin text-ink-3" /> : null}

      {visible && (total > 0 || showEmpty) && (
        <div ref={list} id={lid} role="listbox" onScroll={(e) => setScroll(e.currentTarget.scrollTop)} style={{ maxHeight: maxH }}
          className={cn("scroll-thin overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface p-1", inline ? "mt-2" : "animate-pop absolute inset-x-0 top-12 z-40 shadow-pop")}>
          {showEmpty ? (
            <div className="px-3 py-5 text-center text-sm text-ink-3">Ничего не найдено по «{q.trim()}»{empty?.(q.trim())}</div>
          ) : (
            <div style={{ height: total * rowHeight, position: "relative" }}>
              {items.slice(from, to).map((o, k) => {
                const i = from + k;
                const g = o.group;
                const head = g && (i === 0 || items[i - 1].group !== g);
                const GI = g ? GROUP_ICON[g] : null;
                return (
                  <div key={`${o.id}-${g ?? ""}`} id={`${lid}-${i}`} role="option" aria-selected={i === sel} style={{ position: "absolute", top: i * rowHeight, left: 0, right: 0, height: rowHeight }}>
                    <button type="button" tabIndex={-1} onPointerMove={() => i !== sel && setSel(i)} onClick={() => pick(o)}
                      className={cn("flex h-full w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors", i === sel ? "bg-surface-2" : "hover:bg-surface-2/60")}>
                      {render(o, shownQ, i === sel)}
                      {head && GI && <span className="pointer-events-none absolute right-2 top-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-ink-3"><GI className="size-3" />{GROUP_LABEL[g]}</span>}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {visible && s.total > items.length && !useFallback && (
        <p className={cn("px-2 pt-1 text-[11px] text-ink-3", !inline && "absolute inset-x-0 z-40")} style={inline ? undefined : { top: 48 + maxH + 4 }}>показаны первые {items.length} из {s.total} — уточните запрос</p>
      )}
    </div>
  );
}

/* ───── Товары ───── */

/** Наличие: хватает / мало / нет */
export function stockTone(stock: number, min: number, need = 0) {
  if (stock <= 0) return { tone: "bg-danger", text: "нет" };
  if (stock < need || (min > 0 && stock <= min)) return { tone: "bg-warning", text: "мало" };
  return { tone: "bg-success", text: "есть" };
}

function Thumb({ photo }: { photo: number | null }) {
  return (
    <span className="hidden size-10 shrink-0 sm:grid place-items-center overflow-hidden rounded-lg bg-surface-2 text-ink-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={`/api/files/${photo}`} alt="" loading="lazy" decoding="async" className="size-full object-cover" /> : <Package className="size-4" />}
    </span>
  );
}

/** Высота строки товара в списке: название целиком (до 2 строк) + остаток + цены */
export const PRODUCT_ROW_H = 76;

export function ProductRow({ p, q, priceTypeId }: { p: ProductHit; q: string; priceTypeId?: number | null }) {
  const t = stockTone(p.stock, p.minStock);
  const types = useSearchStatus().priceTypes.filter((x) => !x.isPurchase && p.prices[x.id] != null);
  const price = priceTypeId ? p.prices[priceTypeId] : undefined;
  return (
    <>
      <Thumb photo={p.photo} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] font-semibold leading-tight break-words" title={p.name}><Hl text={p.name} q={q} /></span>
        <span className="flex items-center gap-1.5 truncate text-xs text-ink-3">
          <span className={cn("size-2 shrink-0 rounded-full", t.tone)} aria-hidden />
          <span className={cn("tnum", p.stock <= 0 && "text-danger")}>{num(p.stock)} {p.unit}</span>
          {p.sku && <span className="truncate">· <Hl text={p.sku} q={q} /></span>}
          {p.folder && <span className="hidden truncate sm:inline">· {p.folder}</span>}
          {p.bought > 0 && <span className="shrink-0 text-info">· брал {p.bought}×</span>}
        </span>
        {types.length > 1 && (
          <span className="tnum flex gap-2 truncate text-[11px] leading-tight text-ink-3">
            {types.map((x) => <span key={x.id} className={cn(x.id === priceTypeId && "font-bold text-ink")}>{x.name.split(/\s+/)[0]} {num(p.prices[x.id] / 100)}</span>)}
          </span>
        )}
      </span>
      {price != null && <span className="tnum shrink-0 text-sm font-bold">{money(price)}</span>}
    </>
  );
}

export function ProductPicker({ onPick, priceTypeId, cpId, autoFocus, inputId, placeholder = "Товар: начните вводить название, артикул или штрихкод" }: {
  onPick: (p: ProductOption, hit: ProductHit) => void; priceTypeId?: number | null; cpId?: number | null; autoFocus?: boolean; inputId?: string; placeholder?: string;
}) {
  useEffect(() => { if (cpId) loadClientHistory(cpId); }, [cpId]);
  return (
    <SearchCombo kind="products" rowHeight={PRODUCT_ROW_H} placeholder={placeholder} icon={<Search />} autoFocus={autoFocus} inputId={inputId} clearOnPick opts={{ cpId, limit: 200 }}
      onPick={(h) => onPick(toProduct(h), h)}
      render={(p, q) => <ProductRow p={p} q={q} priceTypeId={priceTypeId} />}
      empty={(q) => <CreateProductLink name={q} />}
      fallback={(q) => fetch(`/api/search?only=products&q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j) => (j.products as ProductOption[]).map((p) => ({ ...p, barcode: null, folder: null, folderId: null, photo: null, minStock: 0, pop: 0, bought: 0 }) as ProductHit))} />
  );
}

function CreateProductLink({ name }: { name: string }) {
  const can = useInstantSearch("products", "", { enabled: false }).status.canCreateProduct;
  if (!can) return null;
  return (
    <a href={`/products/new?name=${encodeURIComponent(name)}`} target="_blank" rel="noreferrer"
      className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-xl bg-yellow px-3 py-2 text-sm font-semibold text-navy">
      <Plus className="size-4" />Создать товар «{name.length > 40 ? name.slice(0, 40) + "…" : name}»
    </a>
  );
}

/* ───── Контрагенты ───── */

export function CpPicker({ value, onChange, kind, autoFocus, inputId }: { value: CpOption | null; onChange: (v: CpOption | null) => void; kind?: "client" | "supplier"; autoFocus?: boolean; inputId?: string }) {
  if (value) return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
      <User className="size-4 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{value.name}</p>{(value.phone || value.clientDebt > 0) && <p className="text-xs text-ink-3">{value.phone}{value.clientDebt > 0 && <span className="text-danger"> · долг {money(value.clientDebt)}</span>}</p>}</div>
      <button type="button" onClick={() => onChange(null)} className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-surface-2" aria-label="Сменить контрагента"><X className="size-4" /></button>
    </div>
  );
  return (
    <SearchCombo kind="counterparties" opts={{ cpKind: kind, limit: 200 }} placeholder={kind === "supplier" ? "Поставщик: название или телефон" : "Клиент: имя, телефон или метка"} icon={<Search />} autoFocus={autoFocus} inputId={inputId} rowHeight={52}
      onPick={(c) => onChange(toCp(c))}
      render={(c, q) => <CpRow c={c} q={q} />}
      fallback={(q) => fetch(`/api/search?only=counterparties&q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`).then((r) => r.json()).then((j) => (j.counterparties as CpOption[]).map((c) => ({ ...c, whatsapp: null, kind: kind ?? "client", tags: [], ourDebt: 0, bin: null }) as CpHit))} />
  );
}

export function CpRow({ c, q }: { c: CpHit; q: string }) {
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-bold text-ink-2">{c.name.replace(/[«»"()]/g, "").trim().slice(0, 1).toUpperCase()}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold"><Hl text={c.name} q={q} /></span>
        <span className="block truncate text-xs text-ink-3">{c.phone ? <Hl text={c.phone} q={q} /> : null}{c.tags.length > 0 && <>{c.phone ? " · " : ""}{c.tags.slice(0, 3).join(", ")}</>}</span>
      </span>
      {c.clientDebt > 0 ? <span className="tnum shrink-0 text-xs font-semibold text-danger">{money(c.clientDebt)}</span> : c.ourDebt > 0 ? <span className="tnum shrink-0 text-xs text-ink-3">мы {money(c.ourDebt)}</span> : null}
    </>
  );
}

/* ───── Сотрудники и папки ───── */

/** Выбор сотрудника или папки с мгновенным поиском (для длинных списков) */
export function SimplePicker({ kind, value, valueName, onChange, placeholder, salesOnly, allowEmpty = true }: {
  kind: "users" | "folders"; value: number | null; valueName?: string | null; onChange: (id: number | null, name: string | null) => void; placeholder?: string; salesOnly?: boolean; allowEmpty?: boolean;
}) {
  const Icon = kind === "users" ? User : FolderTree;
  if (value) return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5">
      <Icon className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{valueName ?? `#${value}`}</span>
      {allowEmpty && <button type="button" onClick={() => onChange(null, null)} className="grid size-9 place-items-center rounded-lg text-ink-3 hover:bg-surface-2" aria-label="Очистить"><X className="size-4" /></button>}
    </div>
  );
  return (
    <SearchCombo kind={kind} opts={{ salesOnly, limit: 100 }} rowHeight={44} placeholder={placeholder ?? (kind === "users" ? "Сотрудник" : "Папка (коллекция)")} icon={<Icon />}
      onPick={(o) => onChange(o.id, o.name)}
      render={(o: SimpleHit, q) => <span className="min-w-0 flex-1 truncate text-sm"><b className="font-semibold"><Hl text={o.name} q={q} /></b>{o.extra && <span className="text-ink-3"> · {o.extra}</span>}</span>} />
  );
}

/* ───── Клавиатурный ввод позиций ───── */

/** После выбора товара — фокус в поле количества этой строки */
export function focusQty(productId: number) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(`[data-qty-for="${productId}"]`);
    if (el) { el.focus(); el.select(); }
  }));
}
/** Enter в количестве — обратно в поиск товара */
export function backToSearch(inputId: string) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); document.getElementById(inputId)?.focus(); }
  };
}

/** Индикатор наличия: зелёный — хватает, жёлтый — частично, красный — нет */
export function StockDot({ stock, need, unit }: { stock: number; need: number; unit: string }) {
  const tone = stock >= need ? "bg-success" : stock > 0 ? "bg-warning" : "bg-danger";
  const t = stock >= need ? `в наличии ${num(stock)} ${unit}` : stock > 0 ? `есть только ${num(stock)} ${unit}` : `нет в наличии (${num(stock)})`;
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink-3" title={t}><span className={cn("size-2 rounded-full", tone)} />{t}</span>;
}
