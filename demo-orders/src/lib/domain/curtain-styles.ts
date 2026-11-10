/**
 * Виды штор для блока «Тип».
 * Чтобы добавить вид: положите webp в public/curtains и допишите строку в этот список.
 */
export type CurtainStyle = {
  id: string;
  label: string;
  src: string;
};

export const CURTAIN_STYLES: readonly CurtainStyle[] = [
  {
    id: "wide-four",
    label: "Тюль и 4 портьеры",
    src: "/curtains/01-wide-four.webp",
  },
  {
    id: "tulle-right",
    label: "Тюль и портьера справа",
    src: "/curtains/02-tulle-right.webp",
  },
  {
    id: "tulle-left",
    label: "Тюль и портьера слева",
    src: "/curtains/03-tulle-left.webp",
  },
  {
    id: "roman",
    label: "Римская штора",
    src: "/curtains/04-roman.webp",
  },
  {
    id: "roman-raised",
    label: "Римская в проёме",
    src: "/curtains/05-roman-raised.webp",
  },
  {
    id: "straight",
    label: "Прямая штора",
    src: "/curtains/06-straight.webp",
  },
  {
    id: "tulle-tiebacks",
    label: "Тюль + портьеры с подхватами",
    src: "/curtains/07-tulle-tiebacks.webp",
  },
];

export function curtainStylesByIds(ids: readonly string[] | undefined): CurtainStyle[] {
  if (!ids?.length) return [];
  const known = new Map(CURTAIN_STYLES.map((style) => [style.id, style]));
  return ids.map((id) => known.get(id)).filter((style): style is CurtainStyle => Boolean(style));
}

/** Multi-select: a chosen id is removed, a new one is appended. */
export function toggleCurtainStyleIds(selected: readonly string[] | undefined, id: string): string[] {
  const current = selected ?? [];
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

export type CurtainStyleTapGate = { armed: boolean };

/**
 * One iPad tap emits pointerdown and then click (Safari often reports detail 0).
 * pointerdown changes the selection; the click that follows must not change it again.
 * A click without a preceding pointerdown (keyboard) still changes the selection.
 * pointerup never changes it.
 */
export function beginCurtainStylePointer(gate: CurtainStyleTapGate): {
  gate: CurtainStyleTapGate;
  toggle: boolean;
} {
  if (gate.armed) return { gate, toggle: false };
  return { gate: { armed: true }, toggle: true };
}

export function finishCurtainStyleClick(gate: CurtainStyleTapGate): {
  gate: CurtainStyleTapGate;
  toggle: boolean;
} {
  if (gate.armed) return { gate: { armed: false }, toggle: false };
  return { gate, toggle: true };
}

export function releaseCurtainStyleTap(gate: CurtainStyleTapGate): CurtainStyleTapGate {
  return gate.armed ? { armed: false } : gate;
}

export function applyCurtainStyleTap(
  selected: readonly string[],
  id: string,
  events: readonly ("pointerdown" | "pointerup" | "click" | "release")[],
): string[] {
  let gate: CurtainStyleTapGate = { armed: false };
  let next = [...selected];
  for (const event of events) {
    if (event === "pointerup") continue;
    if (event === "release") {
      gate = releaseCurtainStyleTap(gate);
      continue;
    }
    if (event === "pointerdown") {
      const step = beginCurtainStylePointer(gate);
      gate = step.gate;
      if (step.toggle) next = toggleCurtainStyleIds(next, id);
      continue;
    }
    const step = finishCurtainStyleClick(gate);
    gate = step.gate;
    if (step.toggle) next = toggleCurtainStyleIds(next, id);
  }
  return next;
}
