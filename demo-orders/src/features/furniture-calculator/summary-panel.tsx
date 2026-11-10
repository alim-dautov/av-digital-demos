"use client";

import { AlertTriangle, FileText, Save } from "lucide-react";
import type { FurnitureQuoteSnapshot } from "@/types";
import { Button } from "@/components/ui/button";
import { cn, formatKzt } from "@/lib/utils";

const COEFFICIENTS = [1.5, 1.8, 2, 2.2, 2.5];
const DISCOUNTS = [0, 5, 10, 15, 20];

function Chips<T extends number>({
  values,
  value,
  format,
  onChange,
  disabled,
  label,
}: {
  values: T[];
  value: number;
  format: (v: T) => string;
  onChange: (v: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={cn(
            "h-7 rounded-sm px-2.5 text-xs tabular-nums transition-colors duration-150",
            value === v
              ? "bg-primary/12 font-medium text-primary"
              : "bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
          )}
        >
          {format(v)}
        </button>
      ))}
    </div>
  );
}

export function SummaryPanel({
  quote,
  canWrite,
  pending,
  orderId,
  onPatch,
  onSubmit,
}: {
  quote: FurnitureQuoteSnapshot;
  canWrite: boolean;
  pending: boolean;
  orderId: string | null;
  onPatch: (p: Partial<FurnitureQuoteSnapshot>) => void;
  onSubmit: (action: "draft" | "proposal") => void;
}) {
  const r = quote.result;
  const sheets = r ? Object.values(r.nestedSheetCounts).reduce((s, n) => s + n, 0) : 0;
  const units = quote.modules.reduce((s, m) => s + m.quantity, 0);
  const empty = quote.modules.length === 0;
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-muted-foreground">Цена для клиента</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
          {formatKzt(quote.total)}
        </p>
        {quote.discountPercent > 0 && (
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            <span className="line-through">{formatKzt(quote.subtotal)}</span>
            <span className="ml-2">скидка {quote.discountPercent}%</span>
          </p>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Модулей", value: String(units) },
          { label: "Листов ЛДСП", value: String(sheets) },
          { label: "Маржа", value: `${quote.marginPercent}%` },
        ].map((k) => (
          <div key={k.label} className="rounded-md bg-canvas px-2 py-2.5">
            <dt className="text-xs leading-tight text-muted-foreground">{k.label}</dt>
            <dd className="mt-0.5 text-base font-semibold tabular-nums">{k.value}</dd>
          </div>
        ))}
      </dl>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Коэффициент</p>
        <Chips
          label="Коэффициент наценки"
          values={COEFFICIENTS}
          value={quote.coefficient}
          format={(v) => `×${v}`}
          disabled={!canWrite}
          onChange={(v) => onPatch({ coefficient: v })}
        />
      </div>
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Скидка</p>
        <Chips
          label="Скидка"
          values={DISCOUNTS}
          value={quote.discountPercent}
          format={(v) => (v === 0 ? "Нет" : `${v}%`)}
          disabled={!canWrite}
          onChange={(v) => onPatch({ discountPercent: v })}
        />
      </div>

      {r && r.costLines.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm">
            <span className="font-medium">Себестоимость</span>
            <span className="tabular-nums">{formatKzt(quote.totalCost)}</span>
          </summary>
          <ul className="mt-2 divide-y divide-border text-xs">
            {r.costLines.map((l) => (
              <li key={l.key} className="flex items-start justify-between gap-3 py-1.5">
                <span className="min-w-0">
                  <span className="block truncate">{l.label}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {l.quantity} {l.unit} × {formatKzt(l.unitPrice)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatKzt(l.total)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="space-y-1 border-t border-border pt-4 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Себестоимость</span>
          <span className="tabular-nums">{formatKzt(quote.totalCost)}</span>
        </div>
        <div className="flex justify-between">
          <span>Прибыль</span>
          <span className={cn("font-medium tabular-nums", quote.grossProfit < 0 && "text-destructive")}>
            {formatKzt(quote.grossProfit)}
          </span>
        </div>
      </div>

      {r && r.warnings.length > 0 && (
        <ul className="space-y-1 rounded-md bg-warning/10 p-3 text-xs text-warning">
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <div className="grid gap-2">
          <Button type="button" disabled={pending || empty} onClick={() => onSubmit("proposal")}>
            <FileText /> Сформировать КП
          </Button>
          <Button type="button" variant="secondary" disabled={pending || empty} onClick={() => onSubmit("draft")}>
            <Save /> {orderId ? "Обновить заказ" : "Сохранить в заказ"}
          </Button>
        </div>
      )}
      {orderId && (
        <p className="text-xs text-muted-foreground">
          Расчёт привязан к заказу ·{" "}
          <a className="text-primary hover:underline" href={`/orders/${orderId}`}>
            открыть
          </a>
        </p>
      )}
    </div>
  );
}
