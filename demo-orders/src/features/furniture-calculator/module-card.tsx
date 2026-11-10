"use client";

import { useState } from "react";
import { ChevronDown, Copy, Minus, Plus, Trash2 } from "lucide-react";
import type {
  FurnitureBaseVariant,
  FurnitureModule,
  FurnitureModulePrice,
  FurniturePart,
} from "@/types";
import { Input } from "@/components/ui/input";
import { cn, formatKzt } from "@/lib/utils";
import {
  BASE_VARIANT_LABELS,
  DEPTH_LIMITS,
  HEIGHT_LIMITS,
  MODULE_TEMPLATES,
  clampDimension,
  clampWidth,
  shelfCount,
} from "@/lib/domain/furniture/modules";
import { ModulePreview } from "./module-preview";

function Stepper({
  label,
  value,
  step,
  min,
  max,
  onCommit,
  disabled,
  isDefault,
}: {
  label: string;
  value: number;
  step: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  isDefault?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(String(value));
  }

  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || n <= 0) {
      setDraft(String(value));
      return;
    }
    setDraft(String(value));
    onCommit(n);
  };

  return (
    <div className="min-w-0">
      <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {isDefault === false && <span className="size-1.5 rounded-full bg-primary" aria-label="изменено" />}
      </span>
      <div className="flex h-10 items-stretch overflow-hidden rounded-md border border-input bg-panel-elevated focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40">
        <button
          type="button"
          aria-label={`${label}: уменьшить`}
          disabled={disabled || value <= min}
          onClick={() => onCommit(value - step)}
          className="grid w-8 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
        >
          <Minus className="size-3.5" />
        </button>
        <input
          inputMode="numeric"
          aria-label={label}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "ArrowUp") {
              e.preventDefault();
              onCommit(value + step);
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              onCommit(value - step);
            }
          }}
          className="w-full min-w-0 bg-transparent text-center text-sm tabular-nums outline-none"
        />
        <button
          type="button"
          aria-label={`${label}: увеличить`}
          disabled={disabled || value >= max}
          onClick={() => onCommit(value + step)}
          className="grid w-8 shrink-0 place-items-center text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground disabled:opacity-40"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ModuleCard({
  module: m,
  index,
  parts,
  pricing,
  active,
  canWrite,
  onChange,
  onDuplicate,
  onRemove,
  onFocus,
}: {
  module: FurnitureModule;
  index: number;
  parts: FurniturePart[];
  pricing?: FurnitureModulePrice;
  active: boolean;
  canWrite: boolean;
  onChange: (m: FurnitureModule) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const t = MODULE_TEMPLATES[m.kind];
  const [hMin, hMax] = HEIGHT_LIMITS[m.kind];
  const [dMin, dMax] = DEPTH_LIMITS[m.kind];
  const shelves = shelfCount(m);
  const carcassParts = parts.filter((p) => !p.isFacade);
  const pieces = Math.round(
    carcassParts.reduce((s, p) => s + p.quantity, 0) / Math.max(1, m.quantity),
  );

  const set = (patch: Partial<FurnitureModule>) => onChange({ ...m, ...patch });
  const ownPrice = m.price != null && m.price > 0;

  return (
    <article
      id={`module-${m.id}`}
      onFocusCapture={onFocus}
      onPointerDown={onFocus}
      className={cn(
        "calculator-inset scroll-mt-32 rounded-lg border border-border p-4 transition-[box-shadow] duration-150",
        active && "ring-1 ring-primary/50",
      )}
    >
      <div className="flex gap-4">
        <div className="hidden h-28 w-24 shrink-0 items-end sm:flex">
          <ModulePreview module={m} highlighted={active} />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                <span className="mr-1.5 text-muted-foreground tabular-nums">{index + 1}.</span>
                {t.label}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {m.height}×{m.width}×{m.depth} мм
                {m.kind !== "base" || m.variant === "doors"
                  ? ` · ${shelves} ${shelves === 1 ? "полка" : shelves >= 2 && shelves <= 4 ? "полки" : "полок"}`
                  : ""}
                {` · ${pieces} дет. на модуль`}
              </p>
            </div>
            {canWrite && (
              <div className="flex shrink-0 gap-0.5">
                <button
                  type="button"
                  onClick={onDuplicate}
                  aria-label="Дублировать модуль"
                  className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground"
                >
                  <Copy className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={onRemove}
                  aria-label="Удалить модуль"
                  className="grid size-8 place-items-center rounded-sm text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Готовые ширины">
            {t.presetWidths.map((w) => (
              <button
                key={w}
                type="button"
                disabled={!canWrite}
                onClick={() => set({ width: w })}
                className={cn(
                  "h-7 rounded-sm px-2.5 text-xs tabular-nums transition-colors duration-150",
                  m.width === w
                    ? "bg-primary/12 font-medium text-primary"
                    : "bg-foreground/[0.04] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground",
                )}
              >
                {w}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stepper
              label="Ширина"
              value={m.width}
              step={t.step}
              min={t.minWidth}
              max={t.maxWidth}
              disabled={!canWrite}
              isDefault={m.width === t.width}
              onCommit={(v) => set({ width: clampWidth(m.kind, v) })}
            />
            <Stepper
              label="Высота"
              value={m.height}
              step={50}
              min={hMin}
              max={hMax}
              disabled={!canWrite}
              isDefault={m.height === t.height}
              onCommit={(v) => set({ height: clampDimension(v, hMin, hMax) })}
            />
            <Stepper
              label="Глубина"
              value={m.depth}
              step={10}
              min={dMin}
              max={dMax}
              disabled={!canWrite}
              isDefault={m.depth === t.depth}
              onCommit={(v) => set({ depth: clampDimension(v, dMin, dMax) })}
            />
            <Stepper
              label="Кол-во"
              value={m.quantity}
              step={1}
              min={1}
              max={50}
              disabled={!canWrite}
              onCommit={(v) => set({ quantity: clampDimension(v, 1, 50) })}
            />
          </div>

          {m.kind === "base" && (
            <div
              role="radiogroup"
              aria-label="Наполнение"
              className="inline-flex rounded-md bg-foreground/[0.04] p-1"
            >
              {(Object.keys(BASE_VARIANT_LABELS) as FurnitureBaseVariant[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={m.variant === v}
                  disabled={!canWrite}
                  onClick={() => set({ variant: v })}
                  className={cn(
                    "touch-manipulation min-h-12 rounded-md px-4 text-base font-medium transition-none",
                    m.variant === v
                      ? "bg-panel text-foreground dark:bg-foreground/[0.1]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {BASE_VARIANT_LABELS[v]}
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <label className="w-44">
              <span className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                Цена за шт., ₸
                {ownPrice && <span className="size-1.5 rounded-full bg-primary" aria-label="своя цена" />}
              </span>
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                disabled={!canWrite}
                placeholder={pricing ? String(pricing.calculated) : "По расчёту"}
                value={m.price || ""}
                onChange={(e) => set({ price: Number(e.target.value) || null })}
                className="tabular-nums"
              />
            </label>
            {pricing && (ownPrice || m.quantity > 1) && (
              <p className="flex h-10 items-center gap-2 text-xs text-muted-foreground tabular-nums">
                {ownPrice && <span>по расчёту {formatKzt(pricing.calculated)}</span>}
                {ownPrice && canWrite && (
                  <button
                    type="button"
                    onClick={() => set({ price: null })}
                    className="text-primary transition-colors duration-150 hover:underline"
                  >
                    сбросить
                  </button>
                )}
                {m.quantity > 1 && (
                  <span className="text-foreground">
                    итого {formatKzt(pricing.price * m.quantity)}
                  </span>
                )}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} />
            {open ? "Скрыть детали" : "Показать детали"}
          </button>
          {open && (
            <ul className="divide-y divide-border text-xs">
              {parts.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-1.5">
                  <span className={cn(p.isFacade && "text-muted-foreground")}>
                    {p.name}
                    {p.edgeNote && <span className="ml-2 text-muted-foreground">{p.edgeNote}</span>}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.length}×{p.width}×16 <span className="ml-2 text-foreground">×{p.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </article>
  );
}
