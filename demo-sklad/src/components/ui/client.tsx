"use client";
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "./cn";
import { Button, fieldBase } from "./index";

/** Ввод суммы в тенге, значение — тиыны */
export function MoneyInput({ value, onChange, className, ...rest }: { value: number | null | undefined; onChange: (tiyn: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [text, setText] = useState(value != null && value !== 0 ? String(value / 100) : value === 0 ? "0" : "");
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setText(value != null ? String(value / 100) : ""); last.current = value; } }, [value]);
  return (
    <div className="relative">
      <input inputMode="decimal" className={cn(fieldBase, "tnum h-11 pl-3 pr-8 text-sm", className)} value={text}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,\s]/g, "");
          setText(t);
          const v = Math.round(Number(t.replace(/\s/g, "").replace(",", ".")) * 100) || 0;
          last.current = v;
          onChange(v);
        }} {...rest} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-3">₸</span>
    </div>
  );
}
export function Checkbox({ checked, onChange, label, className, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2.5 text-sm select-none", disabled && "opacity-50 pointer-events-none", className)}>
      <input type="checkbox" className="size-5 shrink-0 cursor-pointer rounded-md accent-[var(--yellow)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="inline-flex min-h-11 items-center gap-3 text-left text-sm">
      <span className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200", checked ? "bg-yellow" : "bg-line-strong")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-200", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
      </span>
      {label}
    </button>
  );
}

/* ───── Modal / Drawer ───── */
export function Modal({ open, onClose, title, children, footer, size = "md", side = "center" }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl"; side?: "center" | "right";
}) {
  const id = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open || !mounted) return null;
  const w = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={id}>
      <div className="absolute inset-0 animate-in bg-[#071a33]/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn(
        "relative flex max-h-[92dvh] w-full flex-col bg-surface shadow-pop",
        side === "right" ? cn("sm:absolute sm:inset-y-0 sm:right-0 sm:max-h-none sm:rounded-none sm:animate-left", w, "rounded-t-2xl animate-up") : cn("animate-up rounded-t-2xl sm:animate-pop sm:rounded-2xl", w),
      )}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-line-strong sm:hidden absolute top-1.5 left-1/2 -translate-x-1/2" />
          <h2 id={id} className="min-w-0 truncate pt-1 text-base font-bold tracking-tight sm:pt-0">{title}</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Закрыть"><X className="size-5" /></Button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

