import type {
  FurnitureBaseVariant,
  FurnitureFacadePiece,
  FurnitureModule,
  FurnitureModuleKind,
  FurniturePart,
} from "@/types";

export const BOARD = 16;
export const FACADE_GAP = 2;
export const PLINTH = 100;
const TSARGA_WIDTH = 80;
const SHELF_STEP = 300;
const DRAWER_WIDTH_AT_600 = 526;
const DRAWER_DEPTH = 500;
const DRAWER_FRONT_HEIGHT = 105;

export type ModuleTemplate = {
  kind: FurnitureModuleKind;
  label: string;
  shortLabel: string;
  height: number;
  width: number;
  depth: number;
  minWidth: number;
  maxWidth: number;
  step: number;
  presetWidths: number[];
};

export const MODULE_TEMPLATES: Record<FurnitureModuleKind, ModuleTemplate> = {
  base: {
    kind: "base",
    label: "Нижний модуль",
    shortLabel: "Нижний",
    height: 730,
    width: 600,
    depth: 520,
    minWidth: 150,
    maxWidth: 1000,
    step: 50,
    presetWidths: [300, 400, 450, 500, 600, 800],
  },
  wall: {
    kind: "wall",
    label: "Верхний модуль",
    shortLabel: "Верхний",
    height: 900,
    width: 600,
    depth: 320,
    minWidth: 150,
    maxWidth: 1000,
    step: 50,
    presetWidths: [300, 400, 450, 500, 600, 800],
  },
  mezzanine: {
    kind: "mezzanine",
    label: "Антресоль",
    shortLabel: "Антресоль",
    height: 300,
    width: 600,
    depth: 320,
    minWidth: 150,
    maxWidth: 1000,
    step: 50,
    presetWidths: [300, 400, 450, 500, 600, 800],
  },
  tall: {
    kind: "tall",
    label: "Пенал",
    shortLabel: "Пенал",
    height: 2370,
    width: 600,
    depth: 560,
    minWidth: 250,
    maxWidth: 600,
    step: 50,
    presetWidths: [300, 400, 450, 500, 600],
  },
};

export const MODULE_KINDS: FurnitureModuleKind[] = [
  "base",
  "wall",
  "mezzanine",
  "tall",
];

export const BASE_VARIANT_LABELS: Record<FurnitureBaseVariant, string> = {
  doors: "Двери + полка",
  drawers2: "2 ящика",
  drawers3: "3 ящика",
};

const BASE_SHELVES: Record<FurnitureModuleKind, number> = {
  wall: 2,
  base: 1,
  mezzanine: 0,
  tall: 4,
};

export function clampWidth(kind: FurnitureModuleKind, width: number): number {
  const t = MODULE_TEMPLATES[kind];
  const stepped = Math.round(width / t.step) * t.step;
  return Math.min(t.maxWidth, Math.max(t.minWidth, stepped || t.minWidth));
}

export function clampDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export const HEIGHT_LIMITS: Record<FurnitureModuleKind, [number, number]> = {
  base: [300, 1000],
  wall: [250, 1400],
  mezzanine: [150, 700],
  tall: [1200, 2800],
};

export const DEPTH_LIMITS: Record<FurnitureModuleKind, [number, number]> = {
  base: [250, 700],
  wall: [200, 600],
  mezzanine: [200, 600],
  tall: [300, 700],
};

export function createModule(
  kind: FurnitureModuleKind,
  id: string,
  variant: FurnitureBaseVariant = "doors",
): FurnitureModule {
  const t = MODULE_TEMPLATES[kind];
  return {
    id,
    kind,
    variant: kind === "base" ? variant : "doors",
    width: t.width,
    height: t.height,
    depth: t.depth,
    quantity: 1,
  };
}

export function moduleLabel(m: FurnitureModule, index?: number): string {
  const t = MODULE_TEMPLATES[m.kind];
  const variant =
    m.kind === "base" && m.variant !== "doors"
      ? `, ${BASE_VARIANT_LABELS[m.variant].toLowerCase()}`
      : "";
  const prefix = index != null ? `${index + 1}. ` : "";
  return `${prefix}${t.shortLabel} ${m.width}${variant}`;
}

/** +1 shelf for every full +300 mm of height over the template, −1 for every −300 mm. */
export function shelfCount(m: FurnitureModule): number {
  const t = MODULE_TEMPLATES[m.kind];
  if (m.kind === "base" && m.variant !== "doors") return 0;
  const delta = Math.trunc((m.height - t.height) / SHELF_STEP);
  return Math.max(0, BASE_SHELVES[m.kind] + delta);
}

export function drawerCount(m: FurnitureModule): number {
  if (m.kind !== "base") return 0;
  if (m.variant === "drawers2") return 2;
  if (m.variant === "drawers3") return 3;
  return 0;
}

export function doorsAcross(m: FurnitureModule): number {
  return m.width > 600 ? 2 : 1;
}

type FacadeRow = { height: number; count: number; isDrawer: boolean };

/** Facade rows of one module (top to bottom not guaranteed), sizes in mm. */
export function facadeRows(m: FurnitureModule): FacadeRow[] {
  const drawers = drawerCount(m);
  if (drawers > 0) {
    const total = m.height - FACADE_GAP * 2;
    const each = Math.floor((total - FACADE_GAP * 2 * (drawers - 1)) / drawers);
    return [{ height: each, count: drawers, isDrawer: true }];
  }
  const across = doorsAcross(m);
  if (m.kind === "tall") {
    const total = m.height - PLINTH - FACADE_GAP * 2;
    if (total > 1800) {
      const upper = 720;
      const lower = total - upper - FACADE_GAP * 2;
      return [
        { height: lower, count: across, isDrawer: false },
        { height: upper, count: across, isDrawer: false },
      ];
    }
    return [{ height: total, count: across, isDrawer: false }];
  }
  return [{ height: m.height - FACADE_GAP * 2, count: across, isDrawer: false }];
}

export function facadeWidth(m: FurnitureModule, isDrawer: boolean): number {
  const across = isDrawer ? 1 : doorsAcross(m);
  return Math.floor(m.width / across) - FACADE_GAP * 2;
}

export function moduleFacades(m: FurnitureModule): FurnitureFacadePiece[] {
  return facadeRows(m).map((row) => ({
    moduleId: m.id,
    height: row.height,
    width: facadeWidth(m, row.isDrawer),
    quantity: row.count * m.quantity,
  }));
}

export function hingesPerDoor(doorHeight: number): number {
  if (doorHeight <= 900) return 2;
  if (doorHeight <= 1600) return 3;
  if (doorHeight <= 2000) return 4;
  return 5;
}

export type ModuleHardware = {
  hinges: number;
  slides: number;
  legs: number;
  crabs: number;
};

export function moduleHardware(m: FurnitureModule): ModuleHardware {
  let hinges = 0;
  for (const row of facadeRows(m)) {
    if (!row.isDrawer) hinges += hingesPerDoor(row.height) * row.count;
  }
  const floor = m.kind === "base" || m.kind === "tall";
  const hanging = m.kind === "wall" || m.kind === "mezzanine";
  return {
    hinges: hinges * m.quantity,
    slides: drawerCount(m) * m.quantity,
    legs: floor ? (m.width > 800 ? 6 : 4) * m.quantity : 0,
    crabs: hanging ? 2 * m.quantity : 0,
  };
}

type RawPart = {
  name: string;
  length: number;
  width: number;
  qty: number;
  edge: number;
  edgeNote?: string;
};

function carcassParts(m: FurnitureModule): RawPart[] {
  const { width: W, height: H, depth: D } = m;
  const inner = W - BOARD * 2;
  const shelves = shelfCount(m);
  const parts: RawPart[] = [];

  switch (m.kind) {
    case "wall":
    case "mezzanine": {
      parts.push({ name: "Боковина", length: H, width: D, qty: 2, edge: H });
      parts.push({ name: "Крышка / дно", length: inner, width: D, qty: 2, edge: inner });
      if (shelves > 0) {
        parts.push({ name: "Полка", length: inner, width: D, qty: shelves, edge: inner });
      }
      break;
    }
    case "base": {
      parts.push({ name: "Боковина", length: H - BOARD, width: D, qty: 2, edge: H - BOARD });
      parts.push({ name: "Дно", length: W, width: D, qty: 1, edge: W });
      parts.push({ name: "Царга", length: inner, width: TSARGA_WIDTH, qty: 2, edge: inner });
      if (shelves > 0) {
        parts.push({ name: "Полка", length: inner, width: D, qty: shelves, edge: inner });
      }
      parts.push(...drawerBoxParts(m));
      break;
    }
    case "tall": {
      const side = H - PLINTH - BOARD;
      parts.push({ name: "Боковина", length: side, width: D, qty: 2, edge: side });
      parts.push({ name: "Крышка / полки", length: inner, width: D, qty: 1 + shelves, edge: inner });
      parts.push({ name: "Дно", length: W, width: D, qty: 1, edge: W });
      break;
    }
  }
  return parts;
}

/** Bottom and front/back of the box for a 600 mm section; narrower sections shrink it by the difference. */
export function drawerBoxWidth(m: FurnitureModule): number {
  return DRAWER_WIDTH_AT_600 - (600 - m.width);
}

export function drawerBoxSize(m: FurnitureModule): {
  height: number;
  length: number;
  outerWidth: number;
} {
  const facadeH = facadeRows(m)[0]?.height ?? 0;
  return {
    height: Math.min(200, Math.max(80, facadeH - 60)),
    length: DRAWER_DEPTH,
    outerWidth: drawerBoxWidth(m),
  };
}

function edgeNote(sides: number, length: number): string {
  return `кромка: ${sides}×${length}`;
}

function drawerBoxParts(m: FurnitureModule): RawPart[] {
  const drawers = drawerCount(m);
  if (drawers === 0) return [];
  const w = drawerBoxWidth(m);
  const D = DRAWER_DEPTH;
  const side = (height: number, qty: number): RawPart => ({
    name: "Ящик: боковина",
    length: D,
    width: height,
    qty,
    edge: D,
    edgeNote: edgeNote(1, D),
  });
  const parts: RawPart[] = [
    { name: "Ящик: дно", length: D, width: w, qty: drawers, edge: w, edgeNote: edgeNote(1, w) },
    {
      name: "Ящик: перед / зад",
      length: w,
      width: DRAWER_FRONT_HEIGHT,
      qty: 2 * drawers,
      edge: w * 2,
      edgeNote: edgeNote(2, w),
    },
    side(130, 4),
  ];
  if (drawers === 3) parts.push(side(225, 2), side(250, 2));
  return parts;
}

/** LDSP parts of one module (carcass + optional LDSP facades), quantities multiplied by module qty. */
export function moduleParts(
  m: FurnitureModule,
  label: string,
  carcassMaterialId: string,
  facadeMaterialId: string | null,
): FurniturePart[] {
  const parts: FurniturePart[] = carcassParts(m).map((p) => ({
    moduleId: m.id,
    moduleLabel: label,
    name: p.name,
    length: p.length,
    width: p.width,
    quantity: p.qty * m.quantity,
    materialId: carcassMaterialId,
    isFacade: false,
    edge: p.edge,
    ...(p.edgeNote ? { edgeNote: p.edgeNote } : {}),
  }));

  if (facadeMaterialId) {
    for (const f of moduleFacades(m)) {
      parts.push({
        moduleId: m.id,
        moduleLabel: label,
        name: "Фасад",
        length: f.height,
        width: f.width,
        quantity: f.quantity,
        materialId: facadeMaterialId,
        isFacade: true,
        edge: (f.height + f.width) * 2,
      });
    }
  }
  return parts;
}
