/**
 * Дизайн-система DEMO: кнопки, поля, бейджи, карточки, модалки/drawer, пустые состояния, скелетоны.
 * Минимальная зона нажатия 44px на мобильном (кнопки md/lg, поля).
 */


import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
export { MoneyInput, Checkbox, Switch, Modal } from "./client";

export { cn } from "./cn";
import { cn } from "./cn";

/* ───── Button ───── */
type BtnVariant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "outline";
type BtnSize = "sm" | "md" | "lg" | "icon" | "icon-sm";
const btnBase = "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-xl transition-[background,box-shadow,transform,color] duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-primary text-primary-fg hover:brightness-110 shadow-sm",
  accent: "bg-yellow text-navy hover:bg-yellow-600 shadow-sm",
  secondary: "bg-surface text-ink border border-line hover:border-line-strong hover:bg-surface-2",
  outline: "border border-line-strong text-ink hover:bg-surface-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-danger text-white hover:brightness-110",
};
const btnSizes: Record<BtnSize, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
  icon: "h-11 w-11",
  "icon-sm": "h-9 w-9",
};
export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize; loading?: boolean; icon?: ReactNode };
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={cn(btnBase, btnVariants[variant], btnSizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});
export const buttonClass = (variant: BtnVariant = "secondary", size: BtnSize = "md", extra?: string) => cn(btnBase, btnVariants[variant], btnSizes[size], extra);

/* ───── Fields ───── */
export const fieldBase = "w-full rounded-xl border border-line bg-surface text-ink placeholder:text-ink-3 transition-[border,box-shadow] duration-150 focus:outline-none focus:border-yellow focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input({ className, icon, ...rest }, ref) {
  if (icon) return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 [&_svg]:size-4">{icon}</span>
      <input ref={ref} className={cn(fieldBase, "h-11 pl-9 pr-3 text-sm", className)} {...rest} />
    </div>
  );
  return <input ref={ref} className={cn(fieldBase, "h-11 px-3 text-sm", className)} {...rest} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(fieldBase, "min-h-24 px-3 py-2.5 text-sm leading-relaxed", className)} {...rest} />;
});
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(fieldBase, "h-11 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pl-3 pr-9 text-sm", className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237b8aa0' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});
export function Field({ label, hint, error, children, className, required }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && <span className="text-[13px] font-semibold text-ink-2">{label}{required && <span className="text-danger"> *</span>}</span>}
      {children}
      {error ? <span className="text-xs text-danger">{error}</span> : hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
    </label>
  );
}
/* ───── Badge ───── */
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "navy" | "yellow";
const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border border-line",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-[#b45309] dark:text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
  navy: "bg-navy-50 text-navy dark:text-ink",
  yellow: "bg-yellow-50 text-[#8a5a00] dark:text-yellow",
};
export function Badge({ tone = "neutral", children, className, color }: { tone?: Tone; children: ReactNode; className?: string; color?: string }) {
  if (color) return (
    <span className={cn("badge-c inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", className)} style={{ "--c": color } as React.CSSProperties}>
      <span className="size-1.5 rounded-full" style={{ background: color }} />{children}
    </span>
  );
  return <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}>{children}</span>;
}

/* ───── Card / Stat ───── */
export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>{children}</div>;
}
export function CardHeader({ title, action, subtitle }: { title: ReactNode; action?: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0"><h2 className="text-[15px] font-bold tracking-tight">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}</div>
      {action}
    </div>
  );
}
export function Stat({ label, value, hint, tone, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: "up" | "down" | "warn"; icon?: ReactNode }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4 sm:p-5">
      <div className="flex items-center justify-between text-[13px] font-semibold text-ink-3">{label}{icon && <span className="text-ink-3 [&_svg]:size-4">{icon}</span>}</div>
      <div className="tnum text-[22px] font-extrabold tracking-tight sm:text-[26px]">{value}</div>
      {hint && <div className={cn("text-xs font-medium", tone === "up" ? "text-success" : tone === "down" ? "text-danger" : tone === "warn" ? "text-warning" : "text-ink-3")}>{hint}</div>}
    </Card>
  );
}
export function Progress({ value, tone = "navy", className }: { value: number; tone?: "navy" | "yellow" | "success" | "danger"; className?: string }) {
  const c = { navy: "bg-primary", yellow: "bg-yellow", success: "bg-success", danger: "bg-danger" }[tone];
  return <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-2 border border-line", className)}><div className={cn("h-full rounded-full transition-[width] duration-500", c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
}

/* ───── Empty / Skeleton ───── */
export function EmptyState({ icon, title, text, action, className }: { icon?: ReactNode; title: ReactNode; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {icon && <div className="grid size-14 place-items-center rounded-2xl bg-navy-50 text-navy dark:text-yellow [&_svg]:size-6">{icon}</div>}
      <div className="max-w-sm"><p className="text-[15px] font-bold">{title}</p>{text && <p className="mt-1 text-sm text-ink-3">{text}</p>}</div>
      {action}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) { return <div className={cn("skeleton h-4", className)} />; }

/* ───── Page header ───── */
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Avatar({ name, color, size = 32 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="inline-grid shrink-0 place-items-center rounded-full font-bold text-white" style={{ width: size, height: size, background: color ?? "#0B2B54", fontSize: size * 0.38 }} title={name}>
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-ink-3">{children}</kbd>;
}
