import type { FurniturePart, NestedPlacement, NestedSheet } from "@/types";

export const KERF = 4;
export const SHEET_TRIM = 10;

type Rect = { x: number; y: number; w: number; h: number };

type Piece = {
  name: string;
  moduleLabel: string;
  length: number;
  width: number;
  isFacade: boolean;
};

type WorkSheet = { free: Rect[]; placements: NestedPlacement[] };

export type NestOptions = {
  sheetWidth: number;
  sheetHeight: number;
  allowRotation: boolean;
  kerf?: number;
  trim?: number;
};

export type NestResult = {
  sheets: NestedSheet[];
  oversized: string[];
};

function fits(r: Rect, w: number, h: number): boolean {
  return w <= r.w && h <= r.h;
}

/** Split along the shorter leftover axis so the larger remainder stays whole. */
function split(r: Rect, w: number, h: number, kerf: number): Rect[] {
  const restW = r.w - w - kerf;
  const restH = r.h - h - kerf;
  const out: Rect[] = [];
  if (r.w - w <= r.h - h) {
    if (restH > 0) out.push({ x: r.x, y: r.y + h + kerf, w: r.w, h: restH });
    if (restW > 0) out.push({ x: r.x + w + kerf, y: r.y, w: restW, h });
  } else {
    if (restW > 0) out.push({ x: r.x + w + kerf, y: r.y, w: restW, h: r.h });
    if (restH > 0) out.push({ x: r.x, y: r.y + h + kerf, w, h: restH });
  }
  return out;
}

type Choice = { sheet: WorkSheet; rectIndex: number; w: number; h: number; rotated: boolean; score: number };

function bestChoice(sheet: WorkSheet, p: Piece, allowRotation: boolean): Choice | null {
  let best: Choice | null = null;
  const orientations: [number, number, boolean][] = [[p.length, p.width, false]];
  if (allowRotation && p.length !== p.width) orientations.push([p.width, p.length, true]);
  for (let rectIndex = 0; rectIndex < sheet.free.length; rectIndex++) {
    const r = sheet.free[rectIndex];
    for (const [w, h, rotated] of orientations) {
      if (!fits(r, w, h)) continue;
      const score = r.w * r.h - w * h;
      if (!best || score < best.score) {
        best = { sheet, rectIndex, w, h, rotated, score };
      }
    }
  }
  return best;
}

/**
 * Guillotine First Fit Decreasing: pieces sorted by longest side, then area;
 * each goes into the first sheet with room, best-area-fit inside that sheet.
 * Piece `length` runs along the sheet length (grain) unless rotated.
 */
export function nestParts(parts: FurniturePart[], opts: NestOptions): NestResult {
  const kerf = opts.kerf ?? KERF;
  const trim = opts.trim ?? SHEET_TRIM;
  const usableW = opts.sheetWidth - trim * 2;
  const usableH = opts.sheetHeight - trim * 2;

  const pieces: Piece[] = [];
  for (const p of parts) {
    for (let i = 0; i < p.quantity; i++) {
      pieces.push({
        name: p.name,
        moduleLabel: p.moduleLabel,
        length: p.length,
        width: p.width,
        isFacade: p.isFacade,
      });
    }
  }
  pieces.sort(
    (a, b) =>
      Math.max(b.length, b.width) - Math.max(a.length, a.width) ||
      b.length * b.width - a.length * a.width,
  );

  const sheets: WorkSheet[] = [];
  const oversized = new Set<string>();

  for (const piece of pieces) {
    if (piece.length <= 0 || piece.width <= 0) continue;
    const canFit =
      (piece.length <= usableW && piece.width <= usableH) ||
      (opts.allowRotation && piece.width <= usableW && piece.length <= usableH);
    if (!canFit) {
      oversized.add(`${piece.moduleLabel}: ${piece.name} ${piece.length}×${piece.width}`);
      continue;
    }

    let choice: Choice | null = null;
    for (const sheet of sheets) {
      choice = bestChoice(sheet, piece, opts.allowRotation);
      if (choice) break;
    }
    if (!choice) {
      const sheet: WorkSheet = {
        free: [{ x: trim, y: trim, w: usableW, h: usableH }],
        placements: [],
      };
      sheets.push(sheet);
      choice = bestChoice(sheet, piece, opts.allowRotation);
      if (!choice) continue;
    }

    const rect = choice.sheet.free[choice.rectIndex];
    choice.sheet.free.splice(choice.rectIndex, 1, ...split(rect, choice.w, choice.h, kerf));
    choice.sheet.placements.push({
      name: piece.name,
      moduleLabel: piece.moduleLabel,
      x: rect.x,
      y: rect.y,
      w: choice.w,
      h: choice.h,
      rotated: choice.rotated,
      isFacade: piece.isFacade,
    });
  }

  const sheetArea = opts.sheetWidth * opts.sheetHeight;
  return {
    sheets: sheets.map((s) => {
      const used = s.placements.reduce((sum, p) => sum + p.w * p.h, 0);
      return {
        materialId: "",
        width: opts.sheetWidth,
        height: opts.sheetHeight,
        placements: s.placements,
        utilization: Math.round((used / sheetArea) * 1000) / 10,
      };
    }),
    oversized: [...oversized],
  };
}
