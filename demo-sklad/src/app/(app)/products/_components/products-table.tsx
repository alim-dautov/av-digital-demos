"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { FolderInput, Package, Percent, Trash2, X } from "lucide-react";
import { Badge, Button, EmptyState, Field, Modal, Select, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { money, num } from "@/lib/format";
import { deleteProductsAction, moveProductsAction } from "@/modules/products/actions";
import { BulkPriceModal } from "./bulk-price";

export type Row = { id: number; name: string; sku: string | null; unit: string; stock: number; minStock: number; active: boolean; prices: Record<number, number> };
export type PType = { id: number; name: string; isPurchase: boolean };
type FolderOpt = { id: number; name: string; parentId: number | null };

export function ProductsTable({ rows, types, folders, edit, filter }: { rows: Row[]; types: PType[]; folders: FolderOpt[]; edit: boolean; filter: { q?: string; folderId?: number; total: number } }) {
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState(false);
  const [move, setMove] = useState<number | "" | null>(null);
  const { pending, run } = useRun();
  const all = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: number) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };
  const path = useMemo(() => {
    const f = (id: number): string => { const x = folders.find((y) => y.id === id); return x ? (x.parentId ? `${f(x.parentId)} / ${x.name}` : x.name) : ""; };
    return f;
  }, [folders]);
  const shownTypes = types.slice(0, 4);
  const stockCls = (r: Row) => (r.stock < 0 ? "text-danger font-bold" : r.minStock > 0 && r.stock < r.minStock ? "text-warning font-semibold" : r.stock === 0 ? "text-ink-3" : "");

  if (!rows.length) return <EmptyState icon={<Package />} title="Товаров не найдено" text={filter.q ? "Попробуйте изменить запрос или папку" : "Добавьте первый товар или импортируйте из Excel"} />;

  return (
    <>
      {edit && (
        <div className={cn("flex flex-wrap items-center gap-2 border-b border-line bg-yellow-50/60 px-3 py-2 dark:bg-white/5 sm:px-4", !sel.size && "bg-transparent dark:bg-transparent")}>
          <label className="flex h-9 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="size-5 accent-[var(--yellow)]" checked={all} onChange={() => setSel(all ? new Set() : new Set(rows.map((r) => r.id)))} aria-label="Выбрать все" />
            {sel.size ? `Выбрано: ${sel.size}` : "Выбрать"}
          </label>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant={sel.size ? "primary" : "secondary"} icon={<Percent className="size-4" />} onClick={() => setBulk(true)}>
              {sel.size ? "Цены выбранных" : `Цены всех (${filter.total})`}
            </Button>
            {sel.size > 0 && <>
              <Button size="sm" icon={<FolderInput className="size-4" />} onClick={() => setMove("")}>В папку</Button>
              <Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} loading={pending}
                onClick={() => confirm(`Удалить ${sel.size} товар(ов)? Их можно будет восстановить из журнала.`) && run(() => deleteProductsAction({ ids: [...sel] }), { success: "Удалено", onOk: () => setSel(new Set()) })}>Удалить</Button>
              <Button size="icon-sm" variant="ghost" aria-label="Снять выбор" onClick={() => setSel(new Set())}><X className="size-4" /></Button>
            </>}
          </div>
        </div>
      )}
      {/* десктоп */}
      <div className="scroll-thin hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
              {edit && <th className="w-10 px-4 py-3" />}
              <th className="px-4 py-3">Товар</th>
              <th className="px-4 py-3 text-right">Остаток</th>
              {shownTypes.map((t) => <th key={t.id} className={cn("px-4 py-3 text-right whitespace-nowrap", t.isPurchase && "text-warning")}>{t.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-b border-line transition-colors last:border-0 hover:bg-surface-2", sel.has(r.id) && "bg-yellow-50/50 dark:bg-white/5")}>
                {edit && <td className="px-4 py-2.5"><input type="checkbox" className="size-5 accent-[var(--yellow)]" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Выбрать ${r.name}`} /></td>}
                <td className="px-4 py-2.5">
                  <Link href={`/products/${r.id}`} className="font-semibold hover:text-navy-600 dark:hover:text-yellow">{r.name}</Link>
                  <div className="flex items-center gap-2 text-xs text-ink-3">{r.sku && <span>арт. {r.sku}</span>}{!r.active && <Badge>архив</Badge>}</div>
                </td>
                <td className={cn("tnum px-4 py-2.5 text-right whitespace-nowrap", stockCls(r))}>{num(r.stock)} {r.unit}</td>
                {shownTypes.map((t) => <td key={t.id} className="tnum px-4 py-2.5 text-right whitespace-nowrap">{r.prices[t.id] ? money(r.prices[t.id]) : <span className="text-ink-3">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* мобильный */}
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={r.id} className={cn("flex gap-3 px-4 py-3", sel.has(r.id) && "bg-yellow-50/50 dark:bg-white/5")}>
            {edit && <input type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--yellow)]" checked={sel.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Выбрать ${r.name}`} />}
            <Link href={`/products/${r.id}`} className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{r.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-3">
                <span className={cn("tnum", stockCls(r))}>{num(r.stock)} {r.unit}</span>
                {shownTypes.slice(0, 2).map((t) => r.prices[t.id] ? <span key={t.id} className="tnum">{t.name}: <b className="text-ink">{money(r.prices[t.id])}</b></span> : null)}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {bulk && <BulkPriceModal onClose={() => setBulk(false)} types={types} selection={sel.size ? { productIds: [...sel] } : { q: filter.q, folderId: filter.folderId }} count={sel.size || filter.total} onDone={() => setSel(new Set())} />}
      <Modal open={move !== null} onClose={() => setMove(null)} title={`Переместить ${sel.size} товар(ов)`} size="sm"
        footer={<><Button onClick={() => setMove(null)}>Отмена</Button><Button variant="primary" loading={pending} onClick={() => run(() => moveProductsAction({ ids: [...sel], folderId: move === "" || move === null ? null : move }), { success: "Перемещено", onOk: () => { setMove(null); setSel(new Set()); } })}>Переместить</Button></>}>
        <Field label="Папка">
          <Select value={move ?? ""} onChange={(e) => setMove(e.target.value ? Number(e.target.value) : "")}>
            <option value="">— без папки —</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{path(f.id)}</option>)}
          </Select>
        </Field>
      </Modal>
    </>
  );
}
