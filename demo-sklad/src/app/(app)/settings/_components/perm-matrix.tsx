"use client";
import { FLAGS, FLAG_KEYS, LEVELS, MODULES, MODULE_KEYS, type Level, type Permissions } from "@/lib/rbac";
import { Checkbox, cn } from "@/components/ui";

const LV: Level[] = ["none", "view", "full"];

/** Быстрые шаблоны прав — отправная точка, дальше можно поправить вручную */
export const PRESETS: Record<string, { label: string; p: Permissions }> = {
  sales: { label: "Менеджер продаж", p: { modules: { orders: "full", counterparties: "full", pipeline: "full", tasks: "full", prices: "full", products: "view", stock: "view", shipments: "view", notes: "full", whatsapp: "full", assistant: "view" }, flags: { seeOwnEarnings: true } } },
  accounting: { label: "Бухгалтер / учёт", p: { modules: { products: "full", counterparties: "full", receipts: "full", payments: "full", finance: "full", stock: "full", shipments: "full", orders: "view", analytics: "view", prices: "view", tasks: "full", notes: "full", assistant: "view" }, flags: { seePurchase: true, seeProfit: true, seeSalaries: true, payrollPay: true, payrollTimesheet: true, seeOwnEarnings: true } } },
  assembler: { label: "Сборщик / склад", p: { modules: { orders: "view", stock: "view", shipments: "full", tasks: "full", products: "view", notes: "view" }, flags: { seeOwnEarnings: true } } },
  none: { label: "Без доступа", p: { modules: {}, flags: {} } },
};

export function PermMatrix({ value, onChange, limitTo }: { value: Permissions; onChange: (p: Permissions) => void; limitTo?: Permissions }) {
  const setLevel = (m: (typeof MODULE_KEYS)[number], l: Level) => onChange({ ...value, modules: { ...value.modules, [m]: l } });
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <span className="self-center text-xs text-ink-3">Шаблон:</span>
        {Object.entries(PRESETS).map(([k, x]) => (
          <button key={k} type="button" onClick={() => onChange(structuredClone(x.p))} className="min-h-9 rounded-full border border-line px-3 text-xs font-semibold hover:bg-surface-2">{x.label}</button>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)] bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,96px)]">
          <span>Модуль</span>{LV.map((l) => <span key={l} className="text-center">{LEVELS[l]}</span>)}
        </div>
        {MODULE_KEYS.map((m) => {
          const cur = value.modules[m] ?? "none";
          return (
            <div key={m} className="grid grid-cols-[minmax(0,1fr)_repeat(3,64px)] items-center border-t border-line px-3 sm:grid-cols-[minmax(0,1fr)_repeat(3,96px)]">
              <span className="truncate py-2 text-sm">{MODULES[m]}</span>
              {LV.map((l) => {
                const disabled = !!limitTo && rank(l) > rank(limitTo.modules[m] ?? "none");
                return (
                  <label key={l} className={cn("flex min-h-11 cursor-pointer items-center justify-center", disabled && "cursor-not-allowed opacity-30")}>
                    <input type="radio" name={`perm-${m}`} className="size-4 accent-[var(--yellow)]" checked={cur === l} disabled={disabled} onChange={() => setLevel(m, l)} aria-label={`${MODULES[m]}: ${LEVELS[l]}`} />
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        {FLAG_KEYS.map((f) => (
          <Checkbox key={f} label={FLAGS[f]} checked={!!value.flags[f]} disabled={!!limitTo && !limitTo.flags[f]}
            onChange={(v) => onChange({ ...value, flags: { ...value.flags, [f]: v } })} />
        ))}
      </div>
    </div>
  );
}
const rank = (l: Level) => LV.indexOf(l);
