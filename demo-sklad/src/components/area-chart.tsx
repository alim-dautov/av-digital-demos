"use client";
import { useId, useRef, useState } from "react";
import { money } from "@/lib/format";

/**
 * Лёгкий график «Выручка и прибыль» на чистом SVG — без recharts.
 * Рендерится на сервере вместе со страницей (не нужен JS для первой отрисовки), подсказка при наведении/касании.
 */
type Point = { d: string; revenue: number; profit: number | null };

const short = (tiyn: number) => {
  const v = tiyn / 100;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} тыс`;
  return String(Math.round(v));
};
const dShort = (d: string) => (d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d);
const dLong = (d: string) => (d.length >= 10 ? new Date(`${d}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : d);

/** «Красивый» шаг шкалы: 1, 2, 2.5, 5 × 10^n */
function niceStep(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

const SERIES = [
  { key: "revenue" as const, name: "Выручка", color: "var(--chart-1, #0b2b54)", fill: 0.22 },
  { key: "profit" as const, name: "Прибыль", color: "var(--chart-2, #ffb510)", fill: 0.3 },
];

export function RevenueChart({ data, height = 260 }: { data: Point[]; height?: number }) {
  const gid = useId().replace(/:/g, "");
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const hasProfit = data.some((x) => x.profit != null);
  const series = hasProfit ? SERIES : SERIES.slice(0, 1);
  const n = data.length;
  const vals = data.flatMap((x) => [x.revenue, x.profit ?? 0]);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const step = niceStep((hi - lo) / 4 || 100);
  const min = Math.floor(lo / step) * step, max = Math.max(min + step, Math.ceil(hi / step) * step);
  const W = Math.max(1, n - 1);
  const y = (v: number) => 100 - ((v - min) / (max - min)) * 100;
  const x = (i: number) => (n === 1 ? W / 2 : i);
  const line = (k: "revenue" | "profit") => data.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[k] ?? 0)}`).join("");
  const area = (k: "revenue" | "profit") => `${line(k)}L${x(n - 1)},${y(Math.max(min, 0))}L${x(0)},${y(Math.max(min, 0))}Z`;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step);
  const labelIdx = n <= 1 ? [0] : [...new Set([0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(t * (n - 1))))];
  const pct = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const total = data.reduce((s, p) => s + p.revenue, 0);

  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !n) return;
    setHover(Math.min(n - 1, Math.max(0, Math.round(((clientX - r.left) / r.width) * (n - 1)))));
  };
  const h = hover != null ? data[hover] : null;

  return (
    <div className="select-none">
      <div className="relative flex" style={{ height }}>
        {/* шкала Y */}
        <div className="relative w-14 shrink-0 text-[11px] text-ink-3 tnum" aria-hidden>
          {ticks.map((t) => <span key={t} className="absolute right-2 -translate-y-1/2" style={{ top: `${y(t)}%` }}>{short(t)}</span>)}
        </div>
        <div ref={box} className="relative min-w-0 flex-1 touch-pan-y" role="img" aria-label={`График выручки за ${n} дн., всего ${money(total)}`}
          onPointerMove={(e) => pick(e.clientX)} onPointerDown={(e) => pick(e.clientX)} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-line" style={{ top: `${y(t)}%` }} />)}
          <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`${gid}${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" style={{ stopColor: s.color, stopOpacity: s.fill }} /><stop offset="100%" style={{ stopColor: s.color, stopOpacity: 0 }} />
                </linearGradient>
              ))}
            </defs>
            {series.map((s) => (
              <g key={s.key}>
                <path d={area(s.key)} fill={`url(#${gid}${s.key})`} />
                <path d={line(s.key)} fill="none" style={{ stroke: s.color }} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              </g>
            ))}
          </svg>
          {h && hover != null && (
            <>
              <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-line-strong" style={{ left: `${pct(hover)}%` }} />
              {series.map((s) => <span key={s.key} className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface" style={{ left: `${pct(hover)}%`, top: `${y(h[s.key] ?? 0)}%`, background: s.color }} />)}
              <div className={`pointer-events-none absolute top-1 z-10 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop ${pct(hover) > 60 ? "-translate-x-[calc(100%+10px)]" : "translate-x-[10px]"}`} style={{ left: `${pct(hover)}%` }}>
                <p className="mb-1 whitespace-nowrap font-bold text-ink">{dLong(h.d)}</p>
                {series.map((s) => <p key={s.key} className="tnum flex items-center gap-2 whitespace-nowrap text-ink-2"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}: <b className="text-ink">{money(h[s.key] ?? 0)}</b></p>)}
              </div>
            </>
          )}
        </div>
      </div>
      {/* шкала X */}
      <div className="relative ml-14 mt-1.5 h-4 text-[11px] text-ink-3 tnum" aria-hidden>
        {labelIdx.map((i) => <span key={i} className={`absolute ${i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${pct(i)}%` }}>{dShort(data[i].d)}</span>)}
      </div>
      {hasProfit && (
        <div className="mt-2 flex justify-center gap-4 text-xs text-ink-2">
          {series.map((s) => <span key={s.key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}
