"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { SCENE_SCALE } from "./use-drag-along-wall";

const PIXEL_RATIO = 2;
const FONT_SIZE = 12;
const PAD_X = 6;
const PAD_Y = 3;
const RADIUS = 2;

function drawLabel(text: string, emphasis: boolean) {
  const family =
    typeof document !== "undefined" ? getComputedStyle(document.body).fontFamily : "sans-serif";
  const font = `${emphasis ? 500 : 400} ${FONT_SIZE * PIXEL_RATIO}px ${family}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width / PIXEL_RATIO) + PAD_X * 2;
  const h = FONT_SIZE + 4 + PAD_Y * 2;
  canvas.width = w * PIXEL_RATIO;
  canvas.height = h * PIXEL_RATIO;
  ctx.scale(PIXEL_RATIO, PIXEL_RATIO);
  ctx.fillStyle = emphasis ? "#e98c55" : "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, RADIUS);
  ctx.fill();
  ctx.font = `${emphasis ? 500 : 400} ${FONT_SIZE}px ${family}`;
  ctx.fillStyle = emphasis ? "#ffffff" : "#404040";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 0.5);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return { texture, width: w, height: h };
}

const noRaycast = () => null;

/** Screen-sized text tag drawn inside the WebGL scene (always on top, ignores pointer). */
export function TextLabel({
  position,
  text,
  emphasis = false,
}: {
  position: [number, number, number];
  text: string;
  emphasis?: boolean;
}) {
  const viewportHeight = useThree((s) => s.size.height);
  const camera = useThree((s) => s.camera);
  const label = useMemo(() => drawLabel(text, emphasis), [text, emphasis]);
  const material = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: label.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        toneMapped: false,
      }),
    [label],
  );

  useEffect(
    () => () => {
      label.texture.dispose();
      material.dispose();
    },
    [label, material],
  );

  // sizeAttenuation=false sprites are sized in clip space: 1 unit = 2 / proj[5] of the viewport height.
  const perPixel = 2 / (camera.projectionMatrix.elements[5] * Math.max(1, viewportHeight));
  const sx = (label.width * perPixel) / SCENE_SCALE;
  const sy = (label.height * perPixel) / SCENE_SCALE;

  return (
    <sprite
      position={position}
      scale={[sx, sy, 1]}
      material={material}
      renderOrder={10}
      raycast={noRaycast}
    />
  );
}
