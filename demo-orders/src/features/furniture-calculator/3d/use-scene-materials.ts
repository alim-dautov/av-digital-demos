"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { finishPreset } from "./finishes";
import { createFinishMaterial, type FinishMaterial } from "./materials";

export type SceneMaterials = {
  carcass: FinishMaterial;
  facade: FinishMaterial;
  countertop: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  handle: THREE.MeshStandardMaterial;
};

export function useSceneMaterials(carcassKey: string, facadeKey: string): SceneMaterials {
  const carcass = useMemo(
    () => createFinishMaterial(finishPreset(carcassKey, "white"), 0.16),
    [carcassKey],
  );
  const facade = useMemo(
    () => createFinishMaterial(finishPreset(facadeKey, "white"), 0.12),
    [facadeKey],
  );
  const fixed = useMemo(
    () => ({
      countertop: new THREE.MeshStandardMaterial({ color: "#5b5550", roughness: 0.35 }),
      back: new THREE.MeshStandardMaterial({ color: "#e4e1db", roughness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: "#8d8f92", roughness: 0.35, metalness: 0.7 }),
      handle: new THREE.MeshStandardMaterial({ color: "#26272a", roughness: 0.3, metalness: 0.8 }),
    }),
    [],
  );

  useEffect(() => () => carcass.dispose(), [carcass]);
  useEffect(() => () => facade.dispose(), [facade]);
  useEffect(
    () => () => {
      for (const m of Object.values(fixed)) m.dispose();
    },
    [fixed],
  );

  return useMemo(() => ({ carcass, facade, ...fixed }), [carcass, facade, fixed]);
}
