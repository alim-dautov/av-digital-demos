import type { FurnitureFacadeMaterial } from "@/types";

export type FinishPreset = {
  key: string;
  label: string;
  color: string;
  /** Procedural wood grain drawn over the base color */
  wood?: { grain: string; contrast: number };
  roughness: number;
};

export const FINISH_PRESETS: FinishPreset[] = [
  { key: "white", label: "Белый", color: "#f1efea", roughness: 0.55 },
  { key: "cashmere", label: "Кашемир", color: "#d8cab5", roughness: 0.6 },
  { key: "grey", label: "Серый", color: "#a4a6a3", roughness: 0.6 },
  { key: "graphite", label: "Графит", color: "#3c3e41", roughness: 0.5 },
  { key: "sage", label: "Шалфей", color: "#9eac97", roughness: 0.6 },
  { key: "navy", label: "Тёмно-синий", color: "#2f3d53", roughness: 0.5 },
  { key: "oak", label: "Дуб натуральный", color: "#c9a273", wood: { grain: "#8f6a42", contrast: 0.55 }, roughness: 0.7 },
  { key: "sonoma", label: "Дуб сонома", color: "#d8bc92", wood: { grain: "#a8875c", contrast: 0.45 }, roughness: 0.7 },
  { key: "walnut", label: "Орех", color: "#7a5236", wood: { grain: "#4a2f1d", contrast: 0.6 }, roughness: 0.65 },
];

const PRESET_BY_KEY = new Map(FINISH_PRESETS.map((p) => [p.key, p]));

export function finishPreset(key: string | undefined, fallback: string): FinishPreset {
  return PRESET_BY_KEY.get(key ?? "") ?? PRESET_BY_KEY.get(fallback) ?? FINISH_PRESETS[0];
}

export function defaultFacadeFinish(material: FurnitureFacadeMaterial): string {
  if (material === "veneer_1" || material === "veneer_2") return "walnut";
  if (material === "mdf_fluted") return "cashmere";
  if (material === "ldsp" || material === "egger") return "oak";
  return "white";
}

export const DEFAULT_CARCASS_FINISH = "white";
