"use client";

import type { FurnitureModule } from "@/types";
import { COUNTERTOP_THICKNESS as COUNTERTOP, placeModules } from "@/lib/domain/furniture/layout3d";
import { ModuleShape } from "./module-preview";

const BASE_TOP_FROM_FLOOR = 830;

export function KitchenElevation({
  modules,
  activeId,
  onSelect,
  showCountertop,
}: {
  modules: FurnitureModule[];
  activeId: string | null;
  onSelect: (id: string) => void;
  showCountertop: boolean;
}) {
  const { items: all, length } = placeModules(modules);
  if (length === 0) return null;

  const maxTop = Math.max(...all.map((p) => p.top), BASE_TOP_FROM_FLOOR);
  const pad = 60;
  const height = maxTop + pad * 2 + 140;
  const width = length + pad * 2;
  // SVG y grows downwards; convert "from floor" heights
  const toY = (fromFloor: number) => maxTop + pad - fromFloor;
  const baseRun = all.filter((p) => p.module.kind === "base");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto max-h-72 w-full"
      role="img"
      aria-label={`Развёртка: длина ${length} мм`}
    >
      <line
        x1={0}
        x2={width}
        y1={toY(0)}
        y2={toY(0)}
        className="stroke-foreground/20"
        strokeWidth={6}
      />
      {showCountertop &&
        baseRun.map((p) => (
          <rect
            key={`ct-${p.key}`}
            x={pad + p.x - 1}
            y={toY(p.top + COUNTERTOP)}
            width={p.module.width + 2}
            height={COUNTERTOP}
            className="fill-foreground/40"
          />
        ))}
      {all.map((p) => (
        <g
          key={p.key}
          className="cursor-pointer"
          onClick={() => onSelect(p.module.id)}
        >
          <ModuleShape
            module={p.module}
            x={pad + p.x}
            y={toY(p.top)}
            highlighted={activeId === p.module.id}
          />
        </g>
      ))}
      <g className="fill-muted-foreground">
        <line
          x1={pad}
          x2={pad + length}
          y1={toY(0) + 70}
          y2={toY(0) + 70}
          className="stroke-foreground/30"
          strokeWidth={4}
        />
        <line x1={pad} x2={pad} y1={toY(0) + 45} y2={toY(0) + 95} className="stroke-foreground/30" strokeWidth={4} />
        <line x1={pad + length} x2={pad + length} y1={toY(0) + 45} y2={toY(0) + 95} className="stroke-foreground/30" strokeWidth={4} />
        <text
          x={pad + length / 2}
          y={toY(0) + 130}
          textAnchor="middle"
          fontSize={Math.max(56, length / 45)}
          className="tabular-nums"
        >
          {length} мм
        </text>
      </g>
    </svg>
  );
}
