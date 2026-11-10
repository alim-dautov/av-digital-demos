"use client";

import { useRef } from "react";
import { Check } from "lucide-react";
import {
  CURTAIN_STYLES,
  beginCurtainStylePointer,
  finishCurtainStyleClick,
  releaseCurtainStyleTap,
  toggleCurtainStyleIds,
  type CurtainStyleTapGate,
} from "@/lib/domain/curtain-styles";
import { cn } from "@/lib/utils";

const TAP_RESET_MS = 700;

export function CurtainStylePicker({
  selected,
  disabled,
  onChange,
}: {
  selected: string[];
  disabled?: boolean;
  onChange: (ids: string[]) => void;
}) {
  return (
    <div role="group" aria-label="Тип шторы" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {CURTAIN_STYLES.map((style) => (
        <StyleCard
          key={style.id}
          id={style.id}
          label={style.label}
          src={style.src}
          pressed={selected.includes(style.id)}
          disabled={disabled}
          onChange={(id) => onChange(toggleCurtainStyleIds(selected, id))}
        />
      ))}
    </div>
  );
}

function StyleCard({
  id,
  label,
  src,
  pressed,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  src: string;
  pressed: boolean;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const gate = useRef<CurtainStyleTapGate>({ armed: false });
  const resetTimer = useRef<number | null>(null);

  function clearReset() {
    if (resetTimer.current == null) return;
    window.clearTimeout(resetTimer.current);
    resetTimer.current = null;
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onPointerDown={(event) => {
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        const step = beginCurtainStylePointer(gate.current);
        gate.current = step.gate;
        if (!step.toggle) return;
        onChange(id);
        clearReset();
        resetTimer.current = window.setTimeout(() => {
          gate.current = releaseCurtainStyleTap(gate.current);
          resetTimer.current = null;
        }, TAP_RESET_MS);
      }}
      onClick={() => {
        const step = finishCurtainStyleClick(gate.current);
        gate.current = step.gate;
        clearReset();
        if (!step.toggle || disabled) return;
        onChange(id);
      }}
      className={cn(
        "touch-manipulation relative min-h-14 overflow-hidden rounded-xl border bg-white p-2 text-left transition-none active:bg-neutral-100",
        pressed ? "border-[3px] border-primary bg-primary/15" : "border border-neutral-400",
      )}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        className="pointer-events-none aspect-[4/3] w-full rounded-md bg-neutral-50 object-contain"
      />
      <span
        className={cn(
          "pointer-events-none absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border-2",
          pressed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-neutral-400 bg-white text-transparent",
        )}
        aria-hidden
      >
        <Check className="size-5" strokeWidth={2.5} />
      </span>
    </button>
  );
}
