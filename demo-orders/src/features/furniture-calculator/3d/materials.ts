import * as THREE from "three";
import type { FinishPreset } from "./finishes";

function woodTexture(preset: FinishPreset): THREE.CanvasTexture | null {
  if (!preset.wood || typeof document === "undefined") return null;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = preset.color;
  ctx.fillRect(0, 0, size, size);

  // deterministic pseudo-random so every render of a preset looks the same
  let seed = preset.key.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  ctx.strokeStyle = preset.wood.grain;
  for (let i = 0; i < 70; i++) {
    const x = rand() * size;
    const amp = 4 + rand() * 14;
    const freq = 0.004 + rand() * 0.012;
    const phase = rand() * Math.PI * 2;
    ctx.globalAlpha = preset.wood.contrast * (0.15 + rand() * 0.45);
    ctx.lineWidth = 0.6 + rand() * 2.2;
    ctx.beginPath();
    for (let y = 0; y <= size; y += 8) {
      const dx = Math.sin(y * freq + phase) * amp;
      if (y === 0) ctx.moveTo(x + dx, y);
      else ctx.lineTo(x + dx, y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export type FinishMaterial = {
  solid: THREE.MeshStandardMaterial;
  ghost: THREE.MeshStandardMaterial;
  dispose: () => void;
};

export function createFinishMaterial(preset: FinishPreset, ghostOpacity: number): FinishMaterial {
  const map = woodTexture(preset);
  const base = {
    color: map ? "#ffffff" : preset.color,
    map,
    roughness: preset.roughness,
    metalness: 0,
  };
  const solid = new THREE.MeshStandardMaterial(base);
  const ghost = new THREE.MeshStandardMaterial({
    ...base,
    transparent: true,
    opacity: ghostOpacity,
    depthWrite: false,
  });
  return {
    solid,
    ghost,
    dispose: () => {
      solid.dispose();
      ghost.dispose();
      map?.dispose();
    },
  };
}
