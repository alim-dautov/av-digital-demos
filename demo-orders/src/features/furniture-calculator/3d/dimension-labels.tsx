"use client";

import { Line } from "@react-three/drei";
import type { FurnitureRoom } from "@/types";
import {
  FACADE_THICKNESS,
  moduleSpan,
  type Placement,
} from "@/lib/domain/furniture/layout3d";
import { TextLabel } from "./text-label";

type Vec3 = [number, number, number];

const TICK = 60;

function Dimension({
  from,
  to,
  label,
  color = "#55524c",
  vertical = false,
  emphasis = false,
}: {
  from: Vec3;
  to: Vec3;
  label: string;
  color?: string;
  vertical?: boolean;
  emphasis?: boolean;
}) {
  const mid: Vec3 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2];
  const tick = (p: Vec3): [Vec3, Vec3] =>
    vertical
      ? [
          [p[0] - TICK / 2, p[1], p[2]],
          [p[0] + TICK / 2, p[1], p[2]],
        ]
      : [
          [p[0], p[1] - TICK / 2, p[2]],
          [p[0], p[1] + TICK / 2, p[2]],
        ];
  return (
    <group>
      <Line points={[from, to]} color={color} lineWidth={1} />
      <Line points={tick(from)} color={color} lineWidth={1} />
      <Line points={tick(to)} color={color} lineWidth={1} />
      <TextLabel position={mid} text={label} emphasis={emphasis} />
    </group>
  );
}

export function DimensionLabels({
  placement,
  room,
  activeId,
}: {
  placement: Placement;
  room: FurnitureRoom;
  activeId: string | null;
}) {
  const seen = new Set<string>();
  const modules = placement.items.filter((p) => {
    if (seen.has(p.module.id)) return false;
    seen.add(p.module.id);
    return true;
  });
  const frontZ = Math.max(600, ...modules.map((p) => p.module.depth)) + 250;

  return (
    <group>
      {modules.map((p) => {
        const m = p.module;
        const x = placement.moduleX[m.id] ?? p.x;
        const span = moduleSpan(m);
        const z = m.depth + FACADE_THICKNESS + 30;
        const y = p.top + 70;
        const active = m.id === activeId;
        return (
          <group key={m.id}>
            <Dimension
              from={[x, y, z]}
              to={[x + span, y, z]}
              label={m.quantity > 1 ? `${m.quantity}×${m.width}` : `${m.width}`}
              emphasis={active}
            />
            {active && (
              <Dimension
                from={[x + span + 70, p.bottom, z]}
                to={[x + span + 70, p.top, z]}
                label={`${p.top - p.bottom}`}
                vertical
                emphasis
              />
            )}
          </group>
        );
      })}

      {placement.length > 0 && (
        <Dimension
          from={[0, 5, frontZ]}
          to={[placement.length, 5, frontZ]}
          label={`${placement.length} мм`}
        />
      )}
      <Dimension
        from={[0, room.height - 120, 10]}
        to={[room.length, room.height - 120, 10]}
        label={`Стена ${room.length}`}
        color="#8a867e"
      />
      <Dimension
        from={[room.length - 60, 0, 60]}
        to={[room.length - 60, room.height, 60]}
        label={`${room.height}`}
        color="#8a867e"
        vertical
      />
    </group>
  );
}
