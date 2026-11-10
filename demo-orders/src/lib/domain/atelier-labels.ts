import type { AtelierLabelKey, AtelierLabels } from "@/types";

export const DEFAULT_ATELIER_LABELS: AtelierLabels = {
  "install.cornice": "Установка карниза",
  "install.curtains": "Навес",
  "install.covers": "Установка покрывала",
  "install.pillows": "Установка подушек",
  "install.accessories": "Установка аксессуаров",
  "install.rollers": "Установка ролл-штор",
  "sewing.title": "Пошив",
  "sewing.tape": "Монтажная лента",
  "sewing.linearMeters": "Погонные метры",
};

export const ATELIER_LABEL_FIELDS: { key: AtelierLabelKey; hint: string }[] = [
  { key: "install.cornice", hint: "Работа в разделе «Карниз»" },
  { key: "install.curtains", hint: "Работа в разделе «Шторы»" },
  { key: "install.covers", hint: "Работа в разделе «Покрывала»" },
  { key: "install.pillows", hint: "Работа в разделе «Подушки»" },
  { key: "install.accessories", hint: "Работа в разделе «Аксессуары»" },
  { key: "install.rollers", hint: "Работа в разделе «Ролл-шторы»" },
  { key: "sewing.title", hint: "Название раздела пошива" },
  { key: "sewing.tape", hint: "Опция в пошиве" },
  { key: "sewing.linearMeters", hint: "Поле метража в пошиве" },
];

export function resolveAtelierLabels(
  partial?: Partial<AtelierLabels> | null,
): AtelierLabels {
  const out = { ...DEFAULT_ATELIER_LABELS };
  if (!partial) return out;
  for (const key of Object.keys(out) as AtelierLabelKey[]) {
    const v = partial[key]?.trim();
    if (v) out[key] = v;
  }
  return out;
}

export type InstallSection =
  | "cornice"
  | "curtains"
  | "covers"
  | "pillows"
  | "accessories"
  | "rollers";

export function installLabel(labels: AtelierLabels, section: InstallSection) {
  return labels[`install.${section}` as AtelierLabelKey];
}
