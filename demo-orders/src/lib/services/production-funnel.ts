import { getData } from "@/lib/db";
import { updateSettings } from "./settings";
import {
  STAGE_LABELS,
  type BuiltinStageKey,
  type FunnelStage,
  type ProductionStageKey,
} from "@/types";

export const MAX_FUNNEL_STAGES = 30;

/** Воронка по умолчанию — встроенные этапы в привычном порядке. */
export function defaultFunnel(): FunnelStage[] {
  return (Object.keys(STAGE_LABELS) as BuiltinStageKey[]).map((key) => ({
    key,
    label: STAGE_LABELS[key],
  }));
}

export function getFunnel(companyId: string): FunnelStage[] {
  const saved = getData().settings.find((s) => s.companyId === companyId)
    ?.productionStages;
  return saved && saved.length > 0 ? saved.map((s) => ({ ...s })) : defaultFunnel();
}

/** Этапы, которые можно выбрать при создании заказа («Готово» — служебный). */
export function selectableFunnel(companyId: string): FunnelStage[] {
  return getFunnel(companyId).filter((s) => s.key !== "done");
}

/** Оставляет только ключи из воронки компании, без повторов. */
export function filterStageKeys(
  companyId: string,
  keys: readonly string[],
): ProductionStageKey[] {
  const allowed = new Set(getFunnel(companyId).map((s) => s.key));
  return [...new Set(keys)].filter((k): k is ProductionStageKey => allowed.has(k as ProductionStageKey));
}

export class FunnelError extends Error {}

export type FunnelInput = { key?: string | null; label: string }[];

/** Ключи этапов, на которые ссылаются заказы компании, с количеством. */
export function stageUsage(companyId: string): Map<string, number> {
  const usage = new Map<string, number>();
  for (const s of getData().orderStages) {
    if (s.companyId !== companyId) continue;
    usage.set(s.key, (usage.get(s.key) ?? 0) + 1);
  }
  return usage;
}

/**
 * Сохраняет воронку (порядок = порядок массива). Новые этапы без key получают
 * custom_-ключ. Удалить этап, который уже есть в заказах, нельзя — бросает FunnelError
 * (его можно переименовать или переместить). Встроенный «Готово» удалить нельзя.
 */
export function saveFunnel(companyId: string, input: FunnelInput): FunnelStage[] {
  if (input.length === 0) throw new FunnelError("Добавьте хотя бы один этап");
  if (input.length > MAX_FUNNEL_STAGES) {
    throw new FunnelError(`Не больше ${MAX_FUNNEL_STAGES} этапов`);
  }
  const current = getFunnel(companyId);
  const known = new Set<string>([...current.map((s) => s.key), ...Object.keys(STAGE_LABELS)]);
  const seen = new Set<string>();
  const labels = new Set<string>();
  const next: FunnelStage[] = input.map((raw) => {
    const label = raw.label.trim().slice(0, 60);
    if (!label) throw new FunnelError("Название этапа не может быть пустым");
    const lower = label.toLocaleLowerCase("ru");
    if (labels.has(lower)) throw new FunnelError(`Этап «${label}» указан дважды`);
    labels.add(lower);
    let key = raw.key?.trim() || "";
    if (key && !known.has(key)) throw new FunnelError("Неизвестный этап");
    if (!key) key = `custom_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`;
    if (seen.has(key)) throw new FunnelError("Этап указан дважды");
    seen.add(key);
    return { key: key as ProductionStageKey, label };
  });

  if (!seen.has("done")) {
    throw new FunnelError("Этап «Готово» удалить нельзя — его можно переименовать");
  }
  const usage = stageUsage(companyId);
  const blocked = current.filter((s) => !seen.has(s.key) && (usage.get(s.key) ?? 0) > 0);
  if (blocked.length > 0) {
    const list = blocked.map((s) => `«${s.label}» (${usage.get(s.key)})`).join(", ");
    throw new FunnelError(
      `Нельзя удалить этапы, которые уже есть в заказах: ${list}. Переименуйте или переместите их.`,
    );
  }

  updateSettings(companyId, { productionStages: next });
  return next;
}
