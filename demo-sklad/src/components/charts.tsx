"use client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ComposedChart } from "recharts";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";

/** Анимация 220 мс по гайдлайну; при prefers-reduced-motion — без анимации */
const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const ANIM = { isAnimationActive: !reduced, animationDuration: 220 } as const;

/** SVG-атрибуты не понимают var(), поэтому читаем цвета темы и следим за переключением */
type Pal = { navy: string; yellow: string; green: string; blue: string; red: string; violet: string; grid: string; text: string; surface: string };
const LIGHT: Pal = { navy: "#0b2b54", yellow: "#ffb510", green: "#16a34a", blue: "#2563eb", red: "#dc2626", violet: "#7c3aed", grid: "#e3e8ef", text: "#7b8aa0", surface: "#f8fafc" };
function readPal(): Pal {
  if (typeof window === "undefined") return LIGHT;
  const cs = getComputedStyle(document.documentElement);
  const g = (v: string, d: string) => cs.getPropertyValue(v).trim() || d;
  return { navy: g("--chart-1", LIGHT.navy), yellow: g("--chart-2", LIGHT.yellow), green: g("--chart-3", LIGHT.green), blue: g("--chart-4", LIGHT.blue), red: g("--chart-5", LIGHT.red), violet: g("--chart-6", LIGHT.violet), grid: g("--border", LIGHT.grid), text: g("--text-3", LIGHT.text), surface: g("--surface-2", LIGHT.surface) };
}
function usePal() {
  const [p, setP] = useState<Pal>(LIGHT);
  useEffect(() => {
    setP(readPal());
    const mo = new MutationObserver(() => setP(readPal()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return p;
}
const series = (p: Pal) => [p.navy, p.yellow, p.green, p.blue, p.red, p.violet];

const short = (tiyn: number) => {
  const v = tiyn / 100;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} млн`;
  if (Math.abs(v) >= 1e3) return `${Math.round(v / 1e3)} тыс`;
  return String(Math.round(v));
};
const dShort = (d: string) => (d.length >= 10 ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : d);

function Tip({ active, payload, label, count }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; count?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
      <p className="mb-1 font-bold text-ink">{label && label.length >= 10 ? new Date(label).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tnum flex items-center gap-2 text-ink-2"><span className="size-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="text-ink">{count ? p.value.toLocaleString("ru-RU") : money(p.value)}</b></p>
      ))}
    </div>
  );
}

const ax = (p: Pal) => ({ stroke: p.text, tick: { fill: p.text, fontSize: 11 }, tickLine: false, axisLine: false }) as const;

/** Выручка и прибыль по дням */
export function RevenueChart({ data, height = 260 }: { data: { d: string; revenue: number; profit: number | null }[]; height?: number }) {
  const hasProfit = data.some((x) => x.profit != null);
  const p = usePal(), axis = ax(p), C = p;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.navy} stopOpacity={0.25} /><stop offset="100%" stopColor={C.navy} stopOpacity={0} /></linearGradient>
          <linearGradient id="gPr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.yellow} stopOpacity={0.35} /><stop offset="100%" stopColor={C.yellow} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="d" tickFormatter={dShort} {...axis} minTickGap={24} />
        <YAxis tickFormatter={short} {...axis} width={64} />
        <Tooltip content={<Tip />} />
        <Area {...ANIM} type="monotone" dataKey="revenue" name="Выручка" stroke={C.navy} strokeWidth={2} fill="url(#gRev)" />
        {hasProfit && <Area {...ANIM} type="monotone" dataKey="profit" name="Прибыль" stroke={C.yellow} strokeWidth={2} fill="url(#gPr)" />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** count — значения штучные (не деньги): подписи и подсказка без ₸ */
export function BarsChart({ data, keys, height = 260, xKey = "name", horizontal, count }: { data: Record<string, unknown>[]; keys: { key: string; name: string }[]; height?: number; xKey?: string; horizontal?: boolean; count?: boolean }) {
  const fmt = count ? (v: number) => String(v) : short;
  const p = usePal(), axis = ax(p), SERIES = series(p);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={!!horizontal} horizontal={!horizontal} stroke={p.grid} />
        {horizontal ? <><XAxis type="number" tickFormatter={fmt} {...axis} allowDecimals={!count} /><YAxis type="category" dataKey={xKey} {...axis} width={120} /></>
          : <><XAxis dataKey={xKey} {...axis} tickFormatter={(v: string) => (v.length >= 10 ? dShort(v) : v)} /><YAxis tickFormatter={fmt} {...axis} width={count ? 32 : 64} allowDecimals={!count} /></>}
        <Tooltip content={<Tip count={count} />} cursor={{ fill: p.surface }} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => <Bar {...ANIM} key={k.key} dataKey={k.key} name={k.name} fill={SERIES[i]} radius={horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]} maxBarSize={40} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  const SERIES = series(usePal());
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie {...ANIM} data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
          {data.map((_, i) => <Cell key={i} fill={SERIES[i % SERIES.length]} />)}
        </Pie>
        <Tooltip content={<Tip />} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** План/факт: столбцы + линия плана */
export function PlanChart({ data, height = 240 }: { data: { name: string; revenue: number; plan: number }[]; height?: number }) {
  const p = usePal(), axis = ax(p), C = p;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={p.grid} />
        <XAxis dataKey="name" {...axis} />
        <YAxis tickFormatter={short} {...axis} width={64} />
        <Tooltip content={<Tip />} cursor={{ fill: p.surface }} />
        <Bar {...ANIM} dataKey="revenue" name="Факт" fill={C.navy} radius={[6, 6, 0, 0]} maxBarSize={48} />
        <Line {...ANIM} dataKey="plan" name="План" stroke={C.yellow} strokeWidth={3} dot={{ r: 4 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
