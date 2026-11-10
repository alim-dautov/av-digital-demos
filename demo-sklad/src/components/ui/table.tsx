/**
 * Адаптивная таблица: на десктопе — таблица, на мобильном — карточки.
 * Серверный компонент (без состояния), используется в списках модулей.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "./cn";

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  /** скрыть на планшете */
  hideMd?: boolean;
};

export function DataTable<T>({ rows, columns, rowHref, mobile, empty, rowKey, className }: {
  rows: T[];
  columns: Column<T>[];
  rowHref?: (row: T) => string;
  /** Рендер карточки на мобильном */
  mobile: (row: T) => ReactNode;
  empty?: ReactNode;
  rowKey: (row: T) => string | number;
  className?: string;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto md:block scroll-thin">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-ink-3">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-3 font-semibold whitespace-nowrap", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideMd && "hidden lg:table-cell", c.className)}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="group border-b border-line last:border-0 transition-colors hover:bg-surface-2">
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "right" && "text-right tnum", c.align === "center" && "text-center", c.hideMd && "hidden lg:table-cell", c.className)}>
                    {rowHref && i === 0 ? <Link href={rowHref(r)} prefetch={false} className="font-semibold text-ink hover:text-navy-600 dark:hover:text-yellow after:absolute">{c.cell(r)}</Link> : c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            {rowHref ? (
              <Link href={rowHref(r)} prefetch={false} className="block px-4 py-3.5 active:bg-surface-2">{mobile(r)}</Link>
            ) : <div className="px-4 py-3.5">{mobile(r)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-ink-3">
      <span className="tnum">{(page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} из {total}</span>
      <div className="flex gap-1">
        <Link aria-disabled={page <= 1} href={href(Math.max(1, page - 1))} className={cn("grid size-10 place-items-center rounded-xl border border-line hover:bg-surface-2", page <= 1 && "pointer-events-none opacity-40")}><ChevronLeft className="size-4" /></Link>
        <span className="grid h-10 min-w-16 place-items-center px-2 font-semibold text-ink tnum">{page} / {pages}</span>
        <Link aria-disabled={page >= pages} href={href(Math.min(pages, page + 1))} className={cn("grid size-10 place-items-center rounded-xl border border-line hover:bg-surface-2", page >= pages && "pointer-events-none opacity-40")}><ChevronRight className="size-4" /></Link>
      </div>
    </div>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: ReactNode; href: string; count?: number }[]; active: string }) {
  return (
    <div className="no-scrollbar -mx-4 mb-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      {items.map((t) => (
        <Link key={t.key} href={t.href} prefetch={false} className={cn(
          "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-colors",
          t.key === active ? "bg-primary text-primary-fg" : "text-ink-2 hover:bg-surface hover:text-ink",
        )}>
          {t.label}
          {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px] tnum", t.key === active ? "bg-white/20" : "bg-surface-2 border border-line")}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}
