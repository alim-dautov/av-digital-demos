import type { FurnitureModule, FurnitureRoom } from "@/types";
import {
  BOARD,
  FACADE_GAP,
  PLINTH,
  doorsAcross,
  drawerBoxSize,
  drawerCount,
  facadeRows,
  shelfCount,
} from "./modules";

export const LEG_HEIGHT = 100;
export const COUNTERTOP_THICKNESS = 38;
export const COUNTERTOP_OVERHANG = 30;
export const WALL_BOTTOM_FROM_FLOOR = 1450;
export const FACADE_THICKNESS = 16;
export const BACK_THICKNESS = 4;
const TSARGA_WIDTH = 80;
const MIN_WALL_TOP = WALL_BOTTOM_FROM_FLOOR + 900;
const SNAP_STEP = 10;
const SNAP_DISTANCE = 50;

export const DEFAULT_ROOM: FurnitureRoom = { length: 4000, height: 2700, depth: 3000 };

/* ─── Placement along the wall ─── */

export type PlacementRow = "floor" | "wall" | "mezz";

export type PlacedModule = {
  key: string;
  module: FurnitureModule;
  instance: number;
  x: number;
  /** Lowest point of the instance from the floor, mm (legs / plinth included). */
  bottom: number;
  /** Highest point of the carcass from the floor, mm. */
  top: number;
};

export type Placement = {
  items: PlacedModule[];
  /** Left edge of the whole module run (all instances), per module id. */
  moduleX: Record<string, number>;
  length: number;
  wallTop: number;
};

type Interval = { id: string; start: number; end: number };

/** Rows a module occupies along the wall; a tall cabinet blocks everything above it. */
export function moduleRows(m: FurnitureModule): PlacementRow[] {
  if (m.kind === "tall") return ["floor", "wall", "mezz"];
  if (m.kind === "base") return ["floor"];
  if (m.kind === "wall") return ["wall"];
  return ["mezz"];
}

export function moduleSpan(m: FurnitureModule): number {
  return m.width * m.quantity;
}

function overlaps(a: number, b: number, list: Interval[]): boolean {
  return list.some((i) => a < i.end - 0.5 && b > i.start + 0.5);
}

function firstFreeX(span: number, list: Interval[]): number {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  let x = 0;
  for (const i of sorted) {
    if (x + span <= i.start + 0.5) return x;
    x = Math.max(x, i.end);
  }
  return x;
}

/** Explicit x wins; modules without x take the first free gap in their rows, in list order. */
export function resolveModuleX(modules: FurnitureModule[]): Record<string, number> {
  const rows: Record<PlacementRow, Interval[]> = { floor: [], wall: [], mezz: [] };
  const result: Record<string, number> = {};
  const occupy = (m: FurnitureModule, x: number) => {
    result[m.id] = x;
    for (const r of moduleRows(m)) rows[r].push({ id: m.id, start: x, end: x + moduleSpan(m) });
  };
  const pinned = modules
    .filter((m) => m.x != null && Number.isFinite(m.x))
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0));
  for (const m of pinned) {
    // a resized neighbour may now overlap: push right until free
    const blocked = moduleRows(m).flatMap((r) => rows[r]);
    let x = Math.max(0, m.x ?? 0);
    for (let guard = 0; guard < blocked.length + 1; guard++) {
      const hitBy = blocked.find((i) => x < i.end - 0.5 && x + moduleSpan(m) > i.start + 0.5);
      if (!hitBy) break;
      x = hitBy.end;
    }
    occupy(m, x);
  }
  for (const m of modules) {
    if (result[m.id] != null) continue;
    const blocked = moduleRows(m).flatMap((r) => rows[r]);
    occupy(m, firstFreeX(moduleSpan(m), blocked));
  }
  return result;
}

export function placeModules(modules: FurnitureModule[]): Placement {
  const moduleX = resolveModuleX(modules);
  const wallTop = Math.max(
    MIN_WALL_TOP,
    ...modules.filter((m) => m.kind === "wall").map((m) => WALL_BOTTOM_FROM_FLOOR + m.height),
  );
  const items: PlacedModule[] = [];
  let length = 0;
  for (const m of modules) {
    const x0 = moduleX[m.id] ?? 0;
    for (let i = 0; i < m.quantity; i++) {
      const x = x0 + i * m.width;
      let bottom = 0;
      let top = m.height;
      if (m.kind === "base") top = LEG_HEIGHT + m.height;
      else if (m.kind === "wall") {
        bottom = WALL_BOTTOM_FROM_FLOOR;
        top = bottom + m.height;
      } else if (m.kind === "mezzanine") {
        bottom = wallTop;
        top = bottom + m.height;
      }
      items.push({ key: `${m.id}-${i}`, module: m, instance: i, x, bottom, top });
      length = Math.max(length, x + m.width);
    }
  }
  return { items, moduleX, length, wallTop };
}

/** Pins every module at its current position so later edits don't reflow the others. */
export function freezeLayout(modules: FurnitureModule[]): FurnitureModule[] {
  const xs = resolveModuleX(modules);
  return modules.map((m) => (m.x != null ? m : { ...m, x: xs[m.id] }));
}

function neighbourIntervals(modules: FurnitureModule[], id: string): Interval[] {
  const self = modules.find((m) => m.id === id);
  if (!self) return [];
  const rows = new Set(moduleRows(self));
  const xs = resolveModuleX(modules);
  return modules
    .filter((m) => m.id !== id && moduleRows(m).some((r) => rows.has(r)))
    .map((m) => ({ id: m.id, start: xs[m.id], end: xs[m.id] + moduleSpan(m) }));
}

/** Snapped, clamped, collision-free x for dragging module `id` towards `desired`. */
export function resolveDragX(
  modules: FurnitureModule[],
  id: string,
  desired: number,
  roomLength: number,
): number {
  const self = modules.find((m) => m.id === id);
  if (!self) return desired;
  const span = moduleSpan(self);
  const others = neighbourIntervals(modules, id);
  const maxX = Math.max(0, roomLength - span);
  const clamp = (v: number) => Math.min(maxX, Math.max(0, v));

  let x = clamp(Math.round(desired / SNAP_STEP) * SNAP_STEP);
  const edges = [0, maxX, ...others.map((o) => o.end), ...others.map((o) => o.start - span)];
  let best = SNAP_DISTANCE;
  for (const e of edges) {
    const d = Math.abs(e - desired);
    if (d < best && e >= 0 && e <= maxX) {
      best = d;
      x = e;
    }
  }
  if (!overlaps(x, x + span, others)) return x;

  const free = edges
    .map(clamp)
    .filter((c) => !overlaps(c, c + span, others))
    .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired));
  return free[0] ?? resolveModuleX(modules)[id] ?? 0;
}

export function freeSpace(
  modules: FurnitureModule[],
  id: string,
  roomLength: number,
): { left: number; right: number } {
  const self = modules.find((m) => m.id === id);
  if (!self) return { left: 0, right: 0 };
  const x = resolveModuleX(modules)[id] ?? 0;
  const end = x + moduleSpan(self);
  const others = neighbourIntervals(modules, id);
  const leftEdge = Math.max(0, ...others.filter((o) => o.end <= x + 0.5).map((o) => o.end));
  const rightEdge = Math.min(
    roomLength,
    ...others.filter((o) => o.start >= end - 0.5).map((o) => o.start),
  );
  return { left: Math.max(0, x - leftEdge), right: Math.max(0, rightEdge - end) };
}

/* ─── Geometry of one module (mm, origin at left-bottom-back) ─── */

export type PanelPart =
  | "carcass"
  | "shelf"
  | "back"
  | "plinth"
  | "leg"
  | "drawerBox"
  | "drawerBottom";

export type Panel = {
  name: string;
  part: PanelPart;
  /** Centre of the box */
  position: [number, number, number];
  size: [number, number, number];
};

export type FacadeRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  drawer: boolean;
  hingeLeft: boolean;
};

export type Facade = FacadeRect & {
  /** Handle rectangle relative to the facade's bottom-left corner. */
  handle: { x: number; y: number; w: number; h: number };
  /** Drawer box panels relative to the facade's bottom-left-back corner. */
  box: Panel[];
};

export type ModuleGeometry = {
  panels: Panel[];
  facades: Facade[];
  /** Carcass bounds from the instance bottom */
  carcassBottom: number;
  carcassHeight: number;
};

function carcassHeight(m: FurnitureModule): number {
  return m.kind === "tall" ? m.height - PLINTH : m.height;
}

/** Facade rectangles in front-view coordinates (origin top-left of the carcass, y down). */
export function facadeRects(m: FurnitureModule): FacadeRect[] {
  const rects: FacadeRect[] = [];
  const drawers = drawerCount(m);
  if (drawers > 0) {
    const h = facadeRows(m)[0].height;
    for (let i = 0; i < drawers; i++) {
      rects.push({
        x: FACADE_GAP,
        y: FACADE_GAP + i * (h + FACADE_GAP * 2),
        w: m.width - FACADE_GAP * 2,
        h,
        drawer: true,
        hingeLeft: false,
      });
    }
    return rects;
  }
  const across = doorsAcross(m);
  const doorW = m.width / across;
  // rows are listed bottom-first for tall modules; lay them out top-down
  let y = FACADE_GAP;
  for (const row of [...facadeRows(m)].reverse()) {
    for (let i = 0; i < across; i++) {
      rects.push({
        x: i * doorW + FACADE_GAP,
        y,
        w: doorW - FACADE_GAP * 2,
        h: row.height,
        drawer: false,
        hingeLeft: across === 1 ? true : i === 0,
      });
    }
    y += row.height + FACADE_GAP * 2;
  }
  return rects;
}

function box(
  name: string,
  part: PanelPart,
  x: [number, number],
  y: [number, number],
  z: [number, number],
): Panel {
  return {
    name,
    part,
    position: [(x[0] + x[1]) / 2, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2],
    size: [x[1] - x[0], y[1] - y[0], z[1] - z[0]],
  };
}

function shelfPanels(
  m: FurnitureModule,
  count: number,
  from: number,
  to: number,
  depth: number,
): Panel[] {
  const panels: Panel[] = [];
  for (let i = 0; i < count; i++) {
    const y = from + ((to - from) * (i + 1)) / (count + 1);
    panels.push(
      box("Полка", "shelf", [BOARD, m.width - BOARD], [y - BOARD / 2, y + BOARD / 2], [BACK_THICKNESS, depth - 10]),
    );
  }
  return panels;
}

function handleFor(m: FurnitureModule, r: FacadeRect, facadeBottom: number) {
  const bar = 12;
  if (r.drawer) {
    const w = Math.min(300, r.w * 0.4);
    return { x: (r.w - w) / 2, y: r.h - 40 - bar, w, h: bar };
  }
  const len = Math.min(220, r.h * 0.35);
  const x = r.hingeLeft ? r.w - 40 - bar : 40;
  let center: number;
  if (m.kind === "wall" || m.kind === "mezzanine") center = 50 + len / 2;
  else if (m.kind === "base") center = r.h - 50 - len / 2;
  else if (facadeBottom > 1200) center = 50 + len / 2;
  else center = Math.min(r.h - 50 - len / 2, Math.max(50 + len / 2, 1050 - facadeBottom));
  return { x, y: center - len / 2, w: bar, h: len };
}

function drawerBox(m: FurnitureModule, facade: FacadeRect): Panel[] {
  const { height, length, outerWidth } = drawerBoxSize(m);
  const h = Math.min(height, facade.h - 20);
  const x0 = (m.width - outerWidth) / 2 - facade.x;
  const x1 = x0 + outerWidth;
  const y0 = Math.max(10, (facade.h - h) / 2);
  const y1 = y0 + h;
  // z runs backwards from the facade's back face (z = 0) into the carcass
  return [
    box("Ящик: боковина", "drawerBox", [x0, x0 + BOARD], [y0, y1], [-length, 0]),
    box("Ящик: боковина", "drawerBox", [x1 - BOARD, x1], [y0, y1], [-length, 0]),
    box("Ящик: перед / зад", "drawerBox", [x0 + BOARD, x1 - BOARD], [y0, y1], [-BOARD, 0]),
    box("Ящик: перед / зад", "drawerBox", [x0 + BOARD, x1 - BOARD], [y0, y1], [-length, -length + BOARD]),
    box("Ящик: дно", "drawerBottom", [x0 + BOARD, x1 - BOARD], [y0, y0 + BACK_THICKNESS], [-length + BOARD, -BOARD]),
  ];
}

export function moduleGeometry(m: FurnitureModule, withFacades = true): ModuleGeometry {
  const W = m.width;
  const D = m.depth;
  const inner: [number, number] = [BOARD, W - BOARD];
  const full: [number, number] = [0, W];
  const depth: [number, number] = [0, D];
  const panels: Panel[] = [];
  let y0 = 0;
  const Hc = carcassHeight(m);

  switch (m.kind) {
    case "wall":
    case "mezzanine": {
      panels.push(box("Боковина", "carcass", [0, BOARD], [0, Hc], depth));
      panels.push(box("Боковина", "carcass", [W - BOARD, W], [0, Hc], depth));
      panels.push(box("Крышка / дно", "carcass", inner, [Hc - BOARD, Hc], depth));
      panels.push(box("Крышка / дно", "carcass", inner, [0, BOARD], depth));
      panels.push(...shelfPanels(m, shelfCount(m), BOARD, Hc - BOARD, D));
      break;
    }
    case "base": {
      y0 = LEG_HEIGHT;
      const top = y0 + Hc;
      panels.push(box("Дно", "carcass", full, [y0, y0 + BOARD], depth));
      panels.push(box("Боковина", "carcass", [0, BOARD], [y0 + BOARD, top], depth));
      panels.push(box("Боковина", "carcass", [W - BOARD, W], [y0 + BOARD, top], depth));
      panels.push(box("Царга", "carcass", inner, [top - BOARD, top], [D - TSARGA_WIDTH, D]));
      panels.push(box("Царга", "carcass", inner, [top - BOARD, top], [0, TSARGA_WIDTH]));
      panels.push(...shelfPanels(m, shelfCount(m), y0 + BOARD, top - BOARD, D));
      const legs = W > 800 ? 6 : 4;
      const xs = legs === 6 ? [50, W / 2, W - 50] : [50, W - 50];
      for (const lx of xs) {
        for (const lz of [60, D - 60]) {
          panels.push(box("Ножка", "leg", [lx - 20, lx + 20], [0, LEG_HEIGHT], [lz - 20, lz + 20]));
        }
      }
      break;
    }
    case "tall": {
      y0 = PLINTH;
      const top = m.height;
      panels.push(box("Дно", "carcass", full, [y0, y0 + BOARD], depth));
      panels.push(box("Боковина", "carcass", [0, BOARD], [y0 + BOARD, top], depth));
      panels.push(box("Боковина", "carcass", [W - BOARD, W], [y0 + BOARD, top], depth));
      panels.push(box("Крышка / полки", "carcass", inner, [top - BOARD, top], depth));
      panels.push(...shelfPanels(m, shelfCount(m), y0 + BOARD, top - BOARD, D));
      panels.push(box("Цоколь", "plinth", [BOARD, W - BOARD], [0, PLINTH], [D - 60, D - 60 + BOARD]));
      break;
    }
  }
  panels.push(box("Задняя стенка (ХДФ)", "back", [2, W - 2], [y0 + 2, y0 + Hc - 2], [0, BACK_THICKNESS]));

  const facades: Facade[] = withFacades
    ? facadeRects(m).map((r) => {
        const y = y0 + Hc - r.y - r.h;
        return {
          ...r,
          y,
          handle: handleFor(m, r, y),
          box: r.drawer ? drawerBox(m, r) : [],
        };
      })
    : [];

  return { panels, facades, carcassBottom: y0, carcassHeight: Hc };
}
