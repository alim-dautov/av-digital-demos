"use client";

import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { FurnitureModule } from "@/types";
import {
  freezeLayout,
  resolveDragX,
  resolveModuleX,
} from "@/lib/domain/furniture/layout3d";

/** Scene units are metres, the model is in millimetres. */
export const SCENE_SCALE = 0.001;

type DragState = { id: string; x: number; startX: number; base: FurnitureModule[] };

type ControlsLike = { enabled: boolean };

const hit = new THREE.Vector3();

function capture(e: ThreeEvent<PointerEvent>, on: boolean) {
  const target = e.target as unknown as Element;
  try {
    if (on) target.setPointerCapture?.(e.pointerId);
    else target.releasePointerCapture?.(e.pointerId);
  } catch {
    // pointer already released (e.g. cancelled touch)
  }
}

/** Pointer position along the wall (mm) on a plane through the module, facing the camera ray. */
function pointerAlongWall(e: ThreeEvent<PointerEvent>, m: FurnitureModule, bottomY: number): number | null {
  const dir = e.ray.direction;
  const plane =
    Math.abs(dir.z) >= Math.abs(dir.y)
      ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -m.depth * SCENE_SCALE)
      : new THREE.Plane(new THREE.Vector3(0, 1, 0), -(bottomY + m.height / 2) * SCENE_SCALE);
  return e.ray.intersectPlane(plane, hit) ? hit.x / SCENE_SCALE : null;
}

export function useDragAlongWall({
  modules,
  roomLength,
  activeId,
  canWrite,
  onSelect,
  onCommit,
}: {
  modules: FurnitureModule[];
  roomLength: number;
  activeId: string | null;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onCommit: (next: FurnitureModule[]) => void;
}) {
  const getThree = useThree((s) => s.get);
  const setOrbitEnabled = (enabled: boolean) => {
    const controls = getThree().controls as unknown as ControlsLike | null;
    if (controls) controls.enabled = enabled;
  };
  const [drag, setDrag] = useState<DragState | null>(null);
  const offset = useRef(0);

  const viewModules = useMemo(
    () =>
      drag ? drag.base.map((m) => (m.id === drag.id ? { ...m, x: drag.x } : m)) : modules,
    [drag, modules],
  );

  function finish(e: ThreeEvent<PointerEvent>) {
    if (!drag) return;
    e.stopPropagation();
    capture(e, false);
    setOrbitEnabled(true);
    if (Math.abs(drag.x - drag.startX) >= 1) {
      onCommit(drag.base.map((m) => (m.id === drag.id ? { ...m, x: drag.x } : m)));
    }
    setDrag(null);
  }

  function bind(id: string, bottomY: number) {
    return {
      onPointerDown: (e: ThreeEvent<PointerEvent>) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        if (activeId !== id || !canWrite) {
          onSelect(id);
          return;
        }
        const base = freezeLayout(modules);
        const self = base.find((m) => m.id === id);
        if (!self) return;
        const x0 = resolveModuleX(base)[id] ?? 0;
        const px = pointerAlongWall(e, self, bottomY);
        if (px == null) return;
        offset.current = px - x0;
        capture(e, true);
        setOrbitEnabled(false);
        setDrag({ id, x: x0, startX: x0, base });
      },
      onPointerMove: (e: ThreeEvent<PointerEvent>) => {
        if (!drag || drag.id !== id) return;
        e.stopPropagation();
        const self = drag.base.find((m) => m.id === id);
        if (!self) return;
        const px = pointerAlongWall(e, self, bottomY);
        if (px == null) return;
        const x = resolveDragX(drag.base, id, px - offset.current, roomLength);
        if (x !== drag.x) setDrag({ ...drag, x });
      },
      onPointerUp: finish,
      onPointerCancel: finish,
    };
  }

  return { viewModules, dragging: drag?.id ?? null, bind };
}
