"use client";

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, type ThreeElements } from "@react-three/fiber";
import { Edges } from "@react-three/drei";
import {
  FACADE_THICKNESS,
  type ModuleGeometry,
  type Panel,
  type PlacedModule,
} from "@/lib/domain/furniture/layout3d";
import type { SceneMaterials } from "./use-scene-materials";

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

const DOOR_OPEN_ANGLE = THREE.MathUtils.degToRad(100);
const DAMPING = 9;

export type GroupHandlers = Pick<
  ThreeElements["group"],
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onPointerOver"
  | "onPointerOut"
>;

function PanelMesh({ panel, material }: { panel: Panel; material: THREE.Material }) {
  return (
    <mesh
      geometry={UNIT_BOX}
      material={material}
      position={panel.position}
      scale={panel.size}
      castShadow
      receiveShadow
    />
  );
}

function panelMaterial(panel: Panel, mats: SceneMaterials, transparent: boolean): THREE.Material {
  switch (panel.part) {
    case "carcass":
    case "plinth":
      return transparent ? mats.carcass.ghost : mats.carcass.solid;
    case "shelf":
    case "drawerBox":
      return mats.carcass.solid;
    case "leg":
      return mats.metal;
    default:
      return mats.back;
  }
}

export function CabinetMesh({
  placed,
  geometry,
  mats,
  transparent,
  doorsOpen,
  selected,
  reduceMotion,
  handlers,
}: {
  placed: PlacedModule;
  geometry: ModuleGeometry;
  mats: SceneMaterials;
  transparent: boolean;
  doorsOpen: boolean;
  selected: boolean;
  reduceMotion: boolean;
  handlers?: GroupHandlers;
}) {
  const m = placed.module;
  const facadeRefs = useRef<(THREE.Group | null)[]>([]);
  const facadeMat = transparent ? mats.facade.ghost : mats.facade.solid;

  useFrame((state, delta) => {
    let moving = false;
    const k = reduceMotion ? 1 : 1 - Math.exp(-delta * DAMPING);
    geometry.facades.forEach((f, i) => {
      const g = facadeRefs.current[i];
      if (!g) return;
      if (f.drawer) {
        const closedZ = m.depth;
        const target = closedZ + (doorsOpen ? (f.box[0]?.size[2] ?? 300) * 0.7 : 0);
        const next = g.position.z + (target - g.position.z) * k;
        g.position.z = Math.abs(target - next) < 0.5 ? target : next;
        if (g.position.z !== target) moving = true;
      } else {
        const target = doorsOpen ? (f.hingeLeft ? -DOOR_OPEN_ANGLE : DOOR_OPEN_ANGLE) : 0;
        const next = g.rotation.y + (target - g.rotation.y) * k;
        g.rotation.y = Math.abs(target - next) < 0.002 ? target : next;
        if (g.rotation.y !== target) moving = true;
      }
    });
    if (moving) state.invalidate();
  });

  const totalHeight = placed.top - placed.bottom;
  const outlineDepth = m.depth + FACADE_THICKNESS;

  return (
    <group position={[placed.x, placed.bottom, 0]} {...handlers}>
      {geometry.panels.map((p, i) => (
        <PanelMesh key={i} panel={p} material={panelMaterial(p, mats, transparent)} />
      ))}

      {geometry.facades.map((f, i) => {
        const facadeMesh = (offsetX: number) => (
          <>
            <mesh
              geometry={UNIT_BOX}
              material={facadeMat}
              position={[offsetX + f.w / 2, f.h / 2, FACADE_THICKNESS / 2]}
              scale={[f.w, f.h, FACADE_THICKNESS]}
              castShadow
              receiveShadow
            />
            <mesh
              geometry={UNIT_BOX}
              material={mats.handle}
              position={[
                offsetX + f.handle.x + f.handle.w / 2,
                f.handle.y + f.handle.h / 2,
                FACADE_THICKNESS + 8,
              ]}
              scale={[f.handle.w, f.handle.h, 14]}
              castShadow
            />
          </>
        );

        if (f.drawer) {
          return (
            <group
              key={i}
              ref={(g) => {
                facadeRefs.current[i] = g;
              }}
              position={[f.x, f.y, m.depth]}
            >
              {facadeMesh(0)}
              {f.box.map((p, j) => (
                <PanelMesh key={j} panel={p} material={panelMaterial(p, mats, false)} />
              ))}
            </group>
          );
        }

        const pivotX = f.hingeLeft ? f.x : f.x + f.w;
        return (
          <group
            key={i}
            ref={(g) => {
              facadeRefs.current[i] = g;
            }}
            position={[pivotX, f.y, m.depth]}
          >
            {facadeMesh(f.hingeLeft ? 0 : -f.w)}
          </group>
        );
      })}

      {selected && (
        <mesh
          geometry={UNIT_BOX}
          position={[m.width / 2, totalHeight / 2, outlineDepth / 2]}
          scale={[m.width + 8, totalHeight + 8, outlineDepth + 8]}
          raycast={() => null}
        >
          <meshBasicMaterial visible={false} />
          <Edges color="#e98c55" lineWidth={2} />
        </mesh>
      )}
    </group>
  );
}
