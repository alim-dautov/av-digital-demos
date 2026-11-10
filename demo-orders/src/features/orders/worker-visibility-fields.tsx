"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { ORDER_VISIBILITY_FIELDS } from "@/lib/order-visibility";
import { cn } from "@/lib/utils";
import type { OrderWorkerVisibility } from "@/types";

/** Крупные галочки «что видит рабочий» — удобно нажимать на iPad. */
export function WorkerVisibilityFields({
  value,
  onChange,
  disabled,
}: {
  value: OrderWorkerVisibility;
  onChange: (next: OrderWorkerVisibility) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {ORDER_VISIBILITY_FIELDS.map(({ key, label }) => {
        const checked = value[key];
        return (
          <label
            key={key}
            className={cn(
              "flex min-h-14 cursor-pointer items-center gap-3 rounded-md px-4 py-3 text-base transition-colors duration-150",
              checked
                ? "bg-primary/12 text-foreground"
                : "bg-panel-elevated text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <Checkbox
              className="size-6"
              checked={checked}
              disabled={disabled}
              onCheckedChange={(v) => onChange({ ...value, [key]: v === true })}
            />
            {label}
          </label>
        );
      })}
    </div>
  );
}
