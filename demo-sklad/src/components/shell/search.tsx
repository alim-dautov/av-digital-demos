"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2, Package, Search, Users } from "lucide-react";
import { Badge, Modal, cn } from "@/components/ui";
import { money, num } from "@/lib/format";
import { CpRow, ProductRow } from "@/components/pickers";
import { useInstantSearch } from "@/lib/search/client";

type Res = {
  products: { id: number; name: string; sku: string | null; unit: string; stock: number; prices: Record<string, number> }[];
  counterparties: { id: number; name: string; phone: string | null; clientDebt: number; isService: boolean }[];
  orders: { id: number; number: number; counterpartyName: string; total: number; statusName: string; statusColor: string }[];
};

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const qt = q.trim();
  // товары и контрагенты — мгновенно из локального индекса (без debounce), заявки — с сервера
  const ps = useInstantSearch("products", qt, { limit: 8, enabled: open && qt.length > 0 });
  const cs = useInstantSearch("counterparties", qt, { limit: 6, enabled: open && qt.length > 0 });
  const dq = useDebounced(qt, 200);
  const res = useQuery({
    queryKey: ["search-orders", dq], enabled: open && ((dq.length >= 1 && /\d/.test(dq)) || (dq.length >= 3 && !ps.ready)),
    queryFn: () => fetch(`/api/search?q=${encodeURIComponent(dq)}`).then((r) => r.json() as Promise<Res>),
  });
  const items = useMemo(() => {
    if (!qt) return [];
    const d = res.data;
    const orders = (d?.orders ?? []).map((o) => ({ key: `o${o.id}`, href: `/orders/${o.id}`, node: (
      <><ClipboardList className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">Заявка №{o.number} · {o.counterpartyName}</span><Badge color={o.statusColor}>{o.statusName}</Badge><span className="tnum shrink-0 text-xs text-ink-3">{money(o.total)}</span></>
    ) }));
    const cps = cs.ready ? cs.items.map((c) => ({ key: `c${c.id}`, href: `/counterparties/${c.id}`, node: <CpRow c={c} q={qt} /> }))
      : (d?.counterparties ?? []).map((c) => ({ key: `c${c.id}`, href: `/counterparties/${c.id}`, node: <><Users className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.name}</span><span className="text-xs text-ink-3">{c.phone}</span></> }));
    const prs = ps.ready ? ps.items.map((p) => ({ key: `p${p.id}`, href: `/products/${p.id}`, node: <ProductRow p={p} q={qt} /> }))
      : (d?.products ?? []).map((p) => ({ key: `p${p.id}`, href: `/products/${p.id}`, node: <><Package className="size-4 shrink-0 text-ink-3" /><span className="min-w-0 flex-1 text-sm font-semibold leading-tight break-words">{p.name}</span><span className="tnum text-xs text-ink-3">{num(p.stock)} {p.unit}</span></> }));
    return [...orders, ...prs, ...cps];
  }, [qt, res.data, ps.items, cs.items, ps.ready, cs.ready]);
  useEffect(() => setSel(0), [qt]);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const go = (href: string) => { onClose(); router.push(href); };
  const done = ps.resultQ === qt && cs.resultQ === qt && !res.isFetching;
  return (
    <Modal open={open} onClose={onClose} title="Поиск" size="lg">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-3" />
        <input autoFocus value={q} onChange={(e) => { ps.markTyped(); setQ(e.target.value); }} placeholder="Товар, артикул, клиент, телефон или номер заявки"
          autoComplete="off" spellCheck={false} enterKeyHint="search"
          className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-11 pr-10 text-[15px] focus:border-yellow focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter" && items[sel]) go(items[sel].href);
          }} />
        {res.isFetching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-3" />}
      </div>
      <div className="mt-3 min-h-40">
        {!qt && <p className="py-10 text-center text-sm text-ink-3">Начните вводить — ищет с первой буквы, в любой раскладке</p>}
        {qt && done && items.length === 0 && <p className="py-10 text-center text-sm text-ink-3">Ничего не найдено по запросу «{qt}»</p>}
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <li key={it.key}>
              <button onMouseEnter={() => setSel(i)} onClick={() => go(it.href)}
                className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors", i === sel ? "bg-surface-2" : "")}>
                {it.node}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
