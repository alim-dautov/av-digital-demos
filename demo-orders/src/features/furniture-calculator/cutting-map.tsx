"use client";

import { useMemo, useState } from "react";
import type { FurniturePart, FurniturePriceItem, NestedSheet } from "@/types";
import { cn, pluralRu } from "@/lib/utils";

function SheetSvg({ sheet, index, materialName }: { sheet: NestedSheet; index: number; materialName: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const label = Math.min(sheet.width, sheet.height) / 22;
  return (
    <figure className="space-y-2">
      <figcaption className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">
          Лист {index + 1}
          <span className="ml-2 font-normal text-muted-foreground">
            {materialName} · {sheet.width}×{sheet.height}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 tabular-nums",
            sheet.utilization >= 75 ? "text-success" : sheet.utilization >= 45 ? "text-foreground" : "text-warning",
          )}
        >
          {sheet.utilization}%
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${sheet.width} ${sheet.height}`}
        className="h-auto w-full rounded-md bg-foreground/[0.03]"
        role="img"
        aria-label={`Лист ${index + 1}: ${sheet.placements.length} деталей, использование ${sheet.utilization}%`}
      >
        <defs>
          <pattern id={`waste-${index}`} width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="40" className="stroke-foreground/10" strokeWidth="6" />
          </pattern>
        </defs>
        <rect x={0} y={0} width={sheet.width} height={sheet.height} fill={`url(#waste-${index})`} />
        <rect
          x={0}
          y={0}
          width={sheet.width}
          height={sheet.height}
          className="fill-none stroke-foreground/30"
          strokeWidth={8}
        />
        {sheet.placements.map((p, i) => {
          const active = hover === i;
          const showText = p.w > label * 4 && p.h > label * 1.6;
          const vertical = p.h > p.w * 1.6 && p.w > label * 1.6;
          const cx = p.x + p.w / 2;
          const cy = p.y + p.h / 2;
          return (
            <g
              key={i}
              onPointerEnter={() => setHover(i)}
              onPointerLeave={() => setHover(null)}
            >
              <title>{`${p.moduleLabel} — ${p.name} ${p.rotated ? p.h : p.w}×${p.rotated ? p.w : p.h}`}</title>
              <rect
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                className={cn(
                  "transition-[fill] duration-150",
                  p.isFacade
                    ? active ? "fill-foreground/35" : "fill-foreground/20"
                    : active ? "fill-primary/45" : "fill-primary/25",
                  p.isFacade ? "stroke-foreground/50" : "stroke-primary/70",
                )}
                strokeWidth={4}
              />
              {(showText || vertical) && (
                <text
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={label}
                  className="pointer-events-none fill-foreground tabular-nums"
                  transform={vertical && !showText ? `rotate(-90 ${cx} ${cy})` : undefined}
                >
                  {p.rotated ? p.h : p.w}×{p.rotated ? p.w : p.h}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function CuttingMap({
  sheets,
  prices,
}: {
  sheets: NestedSheet[];
  prices: FurniturePriceItem[];
}) {
  const names = useMemo(() => new Map(prices.map((p) => [p.id, p.name.split(" — ")[0]])), [prices]);
  if (sheets.length === 0) {
    return (
      <p className="rounded-lg bg-canvas p-6 text-center text-sm text-muted-foreground">
        Добавьте модули, и здесь появится карта раскроя
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-xs bg-primary/40" /> Корпус
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-xs bg-foreground/25" /> Фасады ЛДСП
        </span>
        <span>Пропил 4 мм, обрезка кромки листа 10 мм. Наведите на деталь, чтобы увидеть модуль.</span>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {sheets.map((s, i) => (
          <SheetSvg key={i} sheet={s} index={i} materialName={names.get(s.materialId) ?? "ЛДСП"} />
        ))}
      </div>
    </div>
  );
}

export function PartsTable({ parts }: { parts: FurniturePart[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, FurniturePart[]>();
    for (const p of parts) {
      const list = map.get(p.moduleId) ?? [];
      list.push(p);
      map.set(p.moduleId, list);
    }
    return [...map.values()];
  }, [parts]);

  if (groups.length === 0) {
    return (
      <p className="rounded-lg bg-canvas p-6 text-center text-sm text-muted-foreground">
        Деталей пока нет
      </p>
    );
  }
  const total = parts.reduce((s, p) => s + p.quantity, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {total} {pluralRu(total, ["деталь", "детали", "деталей"])}, толщина ЛДСП 16 мм
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((list) => (
          <div key={list[0].moduleId} className="rounded-lg bg-canvas p-4">
            <p className="mb-2 text-sm font-medium">{list[0].moduleLabel}</p>
            <ul className="divide-y divide-border text-sm">
              {list.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                  <span className={cn(p.isFacade && "text-muted-foreground")}>
                    {p.name}
                    {p.edgeNote && (
                      <span className="ml-2 text-xs text-muted-foreground">{p.edgeNote}</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {p.length}×{p.width}×16
                    <span className="ml-3 inline-block w-8 text-right text-foreground">×{p.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
