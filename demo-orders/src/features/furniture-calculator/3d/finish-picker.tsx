"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { FINISH_PRESETS } from "./finishes";

function swatchStyle(color: string, wood?: { grain: string }): React.CSSProperties {
  if (!wood) return { backgroundColor: color };
  return {
    backgroundColor: color,
    backgroundImage: `repeating-linear-gradient(95deg, transparent 0 3px, ${wood.grain}55 3px 4px, transparent 4px 7px)`,
  };
}

export function FinishPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {FINISH_PRESETS.map((p) => {
          const selected = p.key === value;
          return (
            <button
              key={p.key}
              type="button"
              title={p.label}
              aria-label={p.label}
              aria-pressed={selected}
              onClick={() => onChange(p.key)}
              className={cn(
                "touch-manipulation relative flex size-11 items-center justify-center rounded-md border transition-none active:brightness-110 disabled:opacity-50",
                selected ? "border-[3px] border-primary" : "border border-neutral-400",
              )}
              style={swatchStyle(p.color, p.wood)}
            >
              {selected && (
                <Check
                  className={cn(
                    "size-4",
                    p.key === "white" || p.key === "cashmere" || p.key === "sonoma"
                      ? "text-neutral-800"
                      : "text-white",
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
