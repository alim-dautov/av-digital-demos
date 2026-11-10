"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { CalculatorSortableSection } from "@/components/calculator/sortable-sections";
import type { AtelierInstallLine } from "@/types";

function parseDecimal(text: string): number {
  const v = Number(text.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : 0;
}

function formatDecimal(n: number): string {
  return n ? String(n).replace(".", ",") : "";
}

/** Free decimal input (comma or dot) with the unit shown inside the field. */
export function NumberField({
  label,
  unit,
  value,
  onChange,
  disabled,
  className,
  hint,
}: {
  label: string;
  unit?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  className?: string;
  hint?: React.ReactNode;
}) {
  const id = useId();
  const [text, setText] = useState(formatDecimal(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (parseDecimal(text) !== value) setText(formatDecimal(value));
  }

  return (
    <div className={className}>
      <Label htmlFor={id}>
        {label}
        {unit ? <span className="text-muted-foreground">, {unit}</span> : null}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          disabled={disabled}
          className={cn("tabular-nums", unit && "pr-14")}
          onChange={(e) => {
            const next = e.target.value.replace(/[^\d.,\s]/g, "");
            setText(next);
            onChange(Math.max(0, parseDecimal(next)));
          }}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <CalculatorSortableSection id={id}>
    <section id={id} className="calculator-block scroll-mt-28">
      <button
        type="button"
        aria-expanded={open}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          event.preventDefault();
          setOpen((value) => !value);
        }}
        onClick={(event) => {
          if (event.detail === 0) setOpen((value) => !value);
        }}
        className="touch-manipulation flex min-h-14 w-full items-center justify-between gap-3 px-4 pb-5 pt-4 pr-14 text-left transition-none active:bg-foreground/[0.04] sm:px-5 sm:pr-16"
      >
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </button>
      {open ? <div className="space-y-5 px-4 pb-5 sm:px-5">{children}</div> : null}
    </section>
    </CalculatorSortableSection>
  );
}

export function InstallFields({
  value,
  onChange,
  defaultSale,
  defaultCost,
  label,
  disabled,
}: {
  value: AtelierInstallLine;
  onChange: (v: AtelierInstallLine) => void;
  defaultSale: number;
  defaultCost: number;
  label: string;
  disabled?: boolean;
}) {
  const kpCheckboxId = useId();
  return (
    <div className="calculator-inset mt-3 grid gap-4 rounded-lg border border-dashed border-border p-4 sm:grid-cols-3">
      <NumberField
        label={label}
        unit="₸"
        value={value.price}
        disabled={disabled}
        onChange={(price) => onChange({ ...value, price, cost: value.cost || defaultCost })}
      />
      <div className="flex items-end gap-2 pb-2 sm:col-span-2">
        <Checkbox
          checked={value.showInKp}
          disabled={disabled}
          onCheckedChange={(c) => onChange({ ...value, showInKp: Boolean(c) })}
          id={kpCheckboxId}
        />
        <Label htmlFor={kpCheckboxId} className="font-normal">
          Показывать «{label}» отдельной строкой в КП
        </Label>
      </div>
    </div>
  );
}
