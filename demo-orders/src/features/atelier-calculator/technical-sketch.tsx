import { formatNumberRu } from "@/lib/utils";

function meters(value: number): string {
  if (!value) return "";
  return `${formatNumberRu(value)} м`;
}

function Pill({
  children,
  className,
}: {
  children: string;
  className: string;
}) {
  if (!children) return null;
  return (
    <span
      className={`absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-neutral-900 shadow-sm ring-1 ring-neutral-300 ${className}`}
    >
      {children}
    </span>
  );
}

export function PillowSketch({ width, length }: { width: number; length: number }) {
  const w = meters(width);
  const l = meters(length);
  return (
    <figure className="relative mx-auto w-full max-w-[320px]">
      <img src="/textiles/pillow.webp" alt="Подушка" className="w-full" />
      <svg viewBox="0 0 100 67" className="pointer-events-none absolute inset-0 h-full w-full text-neutral-900" aria-hidden>
        <line x1="18" y1="6" x2="82" y2="6" stroke="currentColor" strokeWidth="0.45" />
        <line x1="18" y1="4.2" x2="18" y2="7.8" stroke="currentColor" strokeWidth="0.45" />
        <line x1="82" y1="4.2" x2="82" y2="7.8" stroke="currentColor" strokeWidth="0.45" />
        <line x1="18" y1="61" x2="82" y2="61" stroke="currentColor" strokeWidth="0.45" />
        <line x1="18" y1="59.2" x2="18" y2="62.8" stroke="currentColor" strokeWidth="0.45" />
        <line x1="82" y1="59.2" x2="82" y2="62.8" stroke="currentColor" strokeWidth="0.45" />
        <line x1="6" y1="14" x2="6" y2="53" stroke="currentColor" strokeWidth="0.45" />
        <line x1="4.2" y1="14" x2="7.8" y2="14" stroke="currentColor" strokeWidth="0.45" />
        <line x1="4.2" y1="53" x2="7.8" y2="53" stroke="currentColor" strokeWidth="0.45" />
      </svg>
      <Pill className="left-1/2 top-[6%]">{w}</Pill>
      <Pill className="left-1/2 top-[94%]">{w}</Pill>
      <Pill className="left-[7%] top-1/2">{l}</Pill>
    </figure>
  );
}

export function CoverSketch({
  width,
  length,
  overhang,
}: {
  width: number;
  length: number;
  overhang: number;
}) {
  return (
    <figure className="relative mx-auto w-full max-w-[420px]">
      <img src="/textiles/cover.webp" alt="Покрывало" className="w-full" />
      <svg viewBox="0 0 100 67" className="pointer-events-none absolute inset-0 h-full w-full text-neutral-900" aria-hidden>
        <line x1="28" y1="58" x2="72" y2="62" stroke="currentColor" strokeWidth="0.4" />
        <line x1="62" y1="28" x2="78" y2="58" stroke="currentColor" strokeWidth="0.4" />
        <line x1="18" y1="48" x2="22" y2="64" stroke="currentColor" strokeWidth="0.4" />
      </svg>
      <Pill className="left-[48%] top-[78%]">{meters(width)}</Pill>
      <Pill className="left-[78%] top-[46%]">{meters(length)}</Pill>
      <Pill className="left-[16%] top-[70%]">{meters(overhang)}</Pill>
    </figure>
  );
}
