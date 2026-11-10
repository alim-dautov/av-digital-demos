import type { ProductionStageKey } from "@/types";
import { STAGE_LABELS } from "@/types";

export type ProductionColumnDef = {
  key: string;
  label: string;
  stageKeys: ProductionStageKey[];
};

export const PRODUCTION_BOARD_COLUMNS: ProductionColumnDef[] = [
  {
    key: "cutting_edging",
    label: "Распил с закаткой",
    stageKeys: ["cutting", "edging"],
  },
  {
    key: "drilling",
    label: STAGE_LABELS.drilling,
    stageKeys: ["drilling"],
  },
  {
    key: "assembly",
    label: STAGE_LABELS.assembly,
    stageKeys: ["assembly"],
  },
  {
    key: "painting_multicam",
    label: "Покраска / Мультикам",
    stageKeys: ["painting", "multicam"],
  },
  {
    key: "vacuum",
    label: STAGE_LABELS.vacuum,
    stageKeys: ["vacuum"],
  },
  {
    key: "installation",
    label: STAGE_LABELS.installation,
    stageKeys: ["installation"],
  },
];

export function resolveProductionColumnKey(
  stageKey: ProductionStageKey,
): string | null {
  for (const col of PRODUCTION_BOARD_COLUMNS) {
    if (col.stageKeys.includes(stageKey)) return col.key;
  }
  return null;
}

export function getColumnByKey(key: string): ProductionColumnDef | undefined {
  return PRODUCTION_BOARD_COLUMNS.find((c) => c.key === key);
}
