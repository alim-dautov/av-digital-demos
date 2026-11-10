"use client";

import * as THREE from "three";
import type { FurnitureRoom } from "@/types";

const WALL_THICKNESS = 80;
const OVERFLOW_COLOR = "#dc2626";

/**
 * Floor, back wall and side walls in mm; the back wall's face is z = 0, floor is y = 0.
 * When modules run past the wall (`runLength > room.length`), the right wall and the
 * overflow strip on the floor turn red.
 */
export function Room({ room, runLength = 0 }: { room: FurnitureRoom; runLength?: number }) {
  const { length: L, height: H, depth: D } = room;
  const overflow = Math.max(0, runLength - L);
  const gridSize = Math.ceil((Math.max(L + overflow, D) + 2000) / 1000) * 1000;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L / 2, 0, D / 2]} receiveShadow>
        <planeGeometry args={[L, D]} />
        <meshStandardMaterial color="#e9e6e0" roughness={0.95} />
      </mesh>
      <gridHelper
        args={[gridSize, gridSize / 250, "#c9c5bd", "#dad6cf"]}
        position={[L / 2, 0.5, D / 2]}
      />

      <mesh position={[L / 2, H / 2, -WALL_THICKNESS / 2]} receiveShadow>
        <boxGeometry args={[L + WALL_THICKNESS * 2, H, WALL_THICKNESS]} />
        <meshStandardMaterial color="#f3f1ed" roughness={0.95} />
      </mesh>

      {[-WALL_THICKNESS / 2, L + WALL_THICKNESS / 2].map((x, i) => {
        const clash = i === 1 && overflow > 0;
        return (
          <mesh key={x} position={[x, H / 2, D / 2]} receiveShadow>
            <boxGeometry args={[WALL_THICKNESS, H, D]} />
            <meshStandardMaterial
              color={clash ? OVERFLOW_COLOR : "#ecebe7"}
              roughness={0.95}
              transparent
              opacity={clash ? 0.35 : 0.55}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {overflow > 0 && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[L + overflow / 2, 1, D / 2]}>
          <planeGeometry args={[overflow, D]} />
          <meshBasicMaterial color={OVERFLOW_COLOR} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
