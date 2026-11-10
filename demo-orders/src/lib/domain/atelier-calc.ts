import type {
  AtelierAccessoryLine,
  AtelierBlindLine,
  AtelierCorniceLine,
  AtelierCoverLine,
  AtelierCurtainLine,
  AtelierExtraLine,
  AtelierFabricKind,
  AtelierFabricLine,
  AtelierFabricSewing,
  AtelierInstallLine,
  AtelierLabels,
  AtelierLegacyQuoteFields,
  AtelierMountingTape,
  AtelierPieceCharge,
  AtelierPillowLine,
  AtelierQuoteSnapshot,
  AtelierRollerLine,
  AtelierRoom,
  AtelierServicePrices,
  AtelierSewingLine,
  AtelierStoredQuote,
} from "@/types";
import { ATELIER_BLIND_LABELS, ATELIER_FORGED_COLOR_LABELS } from "@/types";
import { formatKzt, formatMeters, formatNumberRu, formatSizeM, generateId, nowIso } from "@/lib/utils";
import {
  installLabel,
  resolveAtelierLabels,
  type InstallSection,
} from "@/lib/domain/atelier-labels";

export const COVER_STITCH_LABELS: Record<AtelierCoverLine["stitch"], string> = {
  romb: "Ромб",
  square: "Квадрат",
  stripe: "Полоса",
};
export const COVER_CORNER_LABELS: Record<AtelierCoverLine["corner"], string> = {
  sharp: "Острый",
  round: "Круглый",
};
export const COVER_TYPE_LABELS: Record<AtelierCoverLine["coverType"], string> = {
  single: "Полуторка",
  one_bed: "Односпалка",
  double: "Двуспалка",
  custom: "Индивидуальный",
};
export const ROLLER_PANEL_LABELS: Record<AtelierRollerLine["panel"], string> = {
  solid: "Сплошное полотно",
  day_night: "День-ночь",
};
export const ROLLER_MOUNT_LABELS: Record<AtelierRollerLine["mount"], string> = {
  wall: "Стена",
  ceiling: "Потолок",
  sash: "Створка",
};
export const ROLLER_MECH_LABELS: Record<AtelierRollerLine["mechanismColor"], string> = {
  white: "Белый",
  gold_oak: "Золотой дуб",
  brown: "Коричневый",
  grey: "Серый",
};
export const ACCESSORY_COLOR_LABELS: Record<AtelierAccessoryLine["color"], string> = {
  gold: "Золото",
  bronze: "Бронза",
  chrome: "Хром",
  white: "Белый",
};
export const FABRIC_KIND_LABELS: Record<AtelierFabricKind, string> = {
  tulle: "Тюль",
  portiere: "Портьера",
};

/** Finite number or 0 — empty inputs and NaN never leak into totals. */
const num = (n: unknown): number => {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
};
const pos = (n: unknown) => Math.max(0, num(n));
const round2 = (n: number) => Math.round(num(n) * 100) / 100;
const money = (n: number) => Math.round(num(n));

export function newId(prefix: string) {
  return generateId(prefix);
}

export function emptyInstall(): AtelierInstallLine {
  return { price: 0, cost: 0, showInKp: true };
}

export function emptyPiece(): AtelierPieceCharge {
  return { quantity: 0, salePerUnit: 0, costPerUnit: 0, price: 0, cost: 0 };
}

type ServiceRates = Pick<
  AtelierServicePrices,
  "sewingSalePerMeter" | "sewingCostPerMeter" | "tapeSalePerMeter" | "tapeCostPerMeter"
> | null;

export function emptyFabricLine(prices: ServiceRates, assemblyCoeff = 2): AtelierFabricLine {
  return {
    id: newId("fb"),
    width: 0,
    height: 0,
    fabricId: null,
    fabricName: "",
    meterage: 0,
    coeffEnabled: true,
    assemblyCoeff,
    showCoeffInKp: true,
    metersNeeded: 0,
    salePerMeter: 0,
    costPerMeter: 0,
    lineTotal: 0,
    lineCost: 0,
    sewing: {
      pricing: "per_meter",
      meters: 0,
      metersManual: false,
      ratePerMeter: prices?.sewingSalePerMeter ?? 0,
      costPerMeter: prices?.sewingCostPerMeter ?? 0,
      price: 0,
      cost: 0,
    },
    tape: {
      enabled: false,
      meters: 0,
      metersManual: false,
      ratePerMeter: prices?.tapeSalePerMeter ?? 0,
      costPerMeter: prices?.tapeCostPerMeter ?? 0,
      price: 0,
      cost: 0,
    },
    extras: [],
    meterageMode: "legacy",
    widthManual: false,
    heightFrom: "",
    cut: "",
    cutNote: "",
    note: "",
    grommets: emptyPiece(),
    loops: emptyPiece(),
    install: emptyInstall(),
    total: 0,
    totalCost: 0,
  };
}

export function emptyExtraLine(): AtelierExtraLine {
  return {
    id: newId("ex"),
    name: "",
    quantity: 1,
    unit: "шт",
    salePerUnit: 0,
    costPerUnit: 0,
    lineTotal: 0,
    lineCost: 0,
  };
}

export function emptyRoom(name = "Комната 1"): AtelierRoom {
  return {
    id: newId("room"),
    name,
    tulle: [],
    portiere: [],
    cornices: [],
    covers: [],
    pillows: [],
    accessories: [],
    rollers: [],
    blinds: [],
    visibleSections: [],
    subtotal: 0,
    totalCost: 0,
  };
}

export function emptyQuote(partial?: Partial<AtelierQuoteSnapshot>): AtelierQuoteSnapshot {
  return {
    clientId: null,
    clientName: "",
    clientPhone: "",
    address: "",
    deadline: "",
    measurementDate: null,
    orderComment: "",
    leadSource: null,
    leadSourceNote: "",
    rooms: [emptyRoom()],
    discountPercent: 0,
    subtotal: 0,
    discountAmount: 0,
    total: 0,
    totalCost: 0,
    grossProfit: 0,
    marginPercent: 0,
    calculatedAt: null,
    unitsVersion: 2,
    ...partial,
  };
}

/* ─── Legacy migration ─── */

/** Legacy snapshots stored sizes in centimeters. */
export function normalizeQuoteUnits(quote: AtelierStoredQuote): AtelierStoredQuote {
  if (quote.unitsVersion === 2) return quote;
  const cm = (n: number) => round2(num(n) / 100);
  return {
    ...quote,
    curtains: quote.curtains?.map((c) => ({ ...c, width: cm(c.width), height: cm(c.height) })),
    covers: quote.covers?.map((c) => ({
      ...c,
      width: cm(c.width),
      length: cm(c.length),
      overhang: cm(c.overhang),
    })),
    pillows: quote.pillows?.map((p) => ({ ...p, width: cm(p.width), height: cm(p.height) })),
    rollers: quote.rollers?.map((r) => ({ ...r, width: cm(r.width), height: cm(r.height) })),
    unitsVersion: 2,
  };
}

function normalizeLegacySewing(
  line: Partial<AtelierSewingLine> & { id: string },
): AtelierSewingLine {
  const legacy = line.ratePerMeter === undefined && line.pricing === undefined;
  return {
    id: line.id,
    name: line.name ?? "",
    curtainId: line.curtainId ?? null,
    linearMeters: num(line.linearMeters),
    linearMetersManual: line.linearMetersManual ?? false,
    pricing: line.pricing ?? (legacy ? "fixed" : "per_meter"),
    ratePerMeter: num(line.ratePerMeter),
    costPerMeter: num(line.costPerMeter),
    mountingTape: line.mountingTape ?? false,
    tapeRatePerMeter: num(line.tapeRatePerMeter),
    tapeCostPerMeter: num(line.tapeCostPerMeter),
    tapePrice: num(line.tapePrice),
    tapeCost: num(line.tapeCost),
    price: num(line.price),
    cost: num(line.cost),
  };
}

function fabricFromCurtain(c: AtelierCurtainLine): AtelierFabricLine {
  return {
    ...emptyFabricLine(null, num(c.assemblyCoeff) || 1),
    id: c.id,
    width: num(c.width),
    height: num(c.height),
    fabricId: c.fabricId ?? null,
    fabricName: c.fabricName ?? "",
    meterage: num(c.width),
    showCoeffInKp: c.showCoeffInKp ?? true,
    salePerMeter: num(c.salePerMeter),
    costPerMeter: num(c.costPerMeter),
    install: c.install ?? emptyInstall(),
  };
}

/** Sewing that cannot sit on its own fabric line keeps its money as extra rows. */
function sewingAsExtras(
  s: AtelierSewingLine,
  meters: number,
  labels: AtelierLabels,
): AtelierExtraLine[] {
  const out: AtelierExtraLine[] = [];
  const fixed = s.pricing === "fixed";
  out.push({
    ...emptyExtraLine(),
    id: `${s.id}_sw`,
    name: s.name || labels["sewing.title"],
    quantity: fixed ? 1 : meters,
    unit: fixed ? "усл." : "п.м.",
    salePerUnit: fixed ? num(s.price) : s.ratePerMeter,
    costPerUnit: fixed ? num(s.cost) : s.costPerMeter,
  });
  if (s.mountingTape) {
    out.push({
      ...emptyExtraLine(),
      id: `${s.id}_tp`,
      name: labels["sewing.tape"],
      quantity: meters,
      unit: "п.м.",
      salePerUnit: s.tapeRatePerMeter,
      costPerUnit: s.tapeCostPerMeter,
    });
  }
  return out;
}

function migrateLegacyRoom(q: AtelierStoredQuote): AtelierRoom {
  const labels = resolveAtelierLabels(q.labels);
  const room = emptyRoom("Комната 1");
  const lines: { kind: AtelierFabricKind; line: AtelierFabricLine; metersNeeded: number }[] =
    (q.curtains ?? []).map((c) => ({
      kind: c.fabricType ?? "portiere",
      line: fabricFromCurtain(c),
      metersNeeded: num(c.width) > 0 ? round2(num(c.width) * num(c.assemblyCoeff)) : 0,
    }));
  const byId = new Map(lines.map((l) => [l.line.id, l]));
  const withSewing = new Set<string>();
  const orphanExtras: AtelierExtraLine[] = [];

  for (const raw of q.sewings ?? []) {
    const s = normalizeLegacySewing(raw);
    const target = s.curtainId ? byId.get(s.curtainId) : undefined;
    const meters =
      !s.linearMetersManual && target ? target.metersNeeded : round2(s.linearMeters);
    if (target && !withSewing.has(target.line.id)) {
      withSewing.add(target.line.id);
      target.line.sewing = {
        pricing: s.pricing,
        meters: s.linearMetersManual ? meters : 0,
        metersManual: s.linearMetersManual,
        ratePerMeter: s.ratePerMeter,
        costPerMeter: s.costPerMeter,
        price: s.price,
        cost: s.cost,
      };
      target.line.tape = {
        enabled: s.mountingTape,
        meters: s.linearMetersManual ? meters : 0,
        metersManual: s.linearMetersManual,
        ratePerMeter: s.tapeRatePerMeter,
        costPerMeter: s.tapeCostPerMeter,
        price: 0,
        cost: 0,
      };
    } else if (target) {
      target.line.extras.push(...sewingAsExtras(s, meters, labels));
    } else {
      orphanExtras.push(...sewingAsExtras(s, meters, labels));
    }
  }

  if (orphanExtras.length) {
    const host = lines[0]?.line;
    if (host) host.extras.push(...orphanExtras);
    else {
      const placeholder = { ...emptyFabricLine(null, 1), extras: orphanExtras };
      lines.push({ kind: "portiere", line: placeholder, metersNeeded: 0 });
    }
  }

  room.tulle = lines.filter((l) => l.kind === "tulle").map((l) => l.line);
  room.portiere = lines.filter((l) => l.kind === "portiere").map((l) => l.line);
  room.cornices = q.cornices ?? [];
  room.covers = q.covers ?? [];
  room.pillows = q.pillows ?? [];
  room.accessories = q.accessories ?? [];
  room.rollers = q.rollers ?? [];
  return room;
}

function normalizeFabricLine(raw: Partial<AtelierFabricLine> & { id?: string }): AtelierFabricLine {
  const base = emptyFabricLine(null);
  return {
    ...base,
    ...raw,
    id: raw.id || base.id,
    fabricName: raw.fabricName ?? "",
    coeffEnabled: raw.coeffEnabled ?? true,
    showCoeffInKp: raw.showCoeffInKp ?? true,
    meterageMode: raw.meterageMode ?? "legacy",
    widthManual: raw.widthManual ?? false,
    heightFrom: raw.heightFrom ?? "",
    cut: raw.cut ?? "",
    cutNote: raw.cutNote ?? "",
    note: raw.note ?? "",
    sewing: { ...base.sewing, ...raw.sewing },
    tape: { ...base.tape, ...raw.tape },
    extras: (raw.extras ?? []).map((e) => ({ ...emptyExtraLine(), ...e })),
    grommets: { ...emptyPiece(), ...raw.grommets },
    loops: { ...emptyPiece(), ...raw.loops },
    install: { ...emptyInstall(), ...raw.install },
  };
}

function normalizeCurtainStyleIds(ids: unknown): string[] | undefined {
  if (!Array.isArray(ids)) return undefined;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

function normalizeRoom(raw: Partial<AtelierRoom>, index: number): AtelierRoom {
  const base = emptyRoom(`Комната ${index + 1}`);
  const hasVisibility = Object.prototype.hasOwnProperty.call(raw, "visibleSections");
  return {
    ...base,
    id: raw.id || base.id,
    name: raw.name ?? base.name,
    tulle: (raw.tulle ?? []).map(normalizeFabricLine),
    portiere: (raw.portiere ?? []).map(normalizeFabricLine),
    cornices: raw.cornices ?? [],
    covers: raw.covers ?? [],
    pillows: raw.pillows ?? [],
    accessories: (raw.accessories ?? []).map((a) => ({
      ...a,
      install: { ...emptyInstall(), ...a.install },
    })),
    rollers: raw.rollers ?? [],
    blinds: raw.blinds ?? [],
    visibleSections: hasVisibility ? raw.visibleSections : undefined,
    curtainStyleIds: normalizeCurtainStyleIds(raw.curtainStyleIds),
  };
}

const LEGACY_KEYS = [
  "cornices",
  "curtains",
  "sewings",
  "covers",
  "pillows",
  "accessories",
  "rollers",
] as const satisfies readonly (keyof AtelierLegacyQuoteFields)[];

/** Accepts current and pre-rooms snapshots; always returns the rooms shape. */
export function normalizeAtelierQuote(
  input: AtelierStoredQuote | AtelierQuoteSnapshot,
): AtelierQuoteSnapshot {
  const q = normalizeQuoteUnits(input as AtelierStoredQuote);
  const rooms = Array.isArray(q.rooms)
    ? q.rooms.map(normalizeRoom)
    : [migrateLegacyRoom(q)];
  const rest: Partial<AtelierStoredQuote> = { ...q };
  for (const key of LEGACY_KEYS) delete rest[key];
  return {
    ...emptyQuote(),
    ...rest,
    measurementDate: q.measurementDate || null,
    rooms,
    unitsVersion: 2,
  };
}

/* ─── Calculation ─── */

/** Disabled, empty or non-positive coefficient means no gathering (×1). */
export function effectiveCoeff(line: Pick<AtelierFabricLine, "coeffEnabled" | "assemblyCoeff">) {
  const c = num(line.assemblyCoeff);
  return line.coeffEnabled && c > 0 ? c : 1;
}

/** Recalculate gathering from the desired fabric consumption, retaining the original width. */
export function coefficientForFabricMeters(line: AtelierFabricLine, meters: number): number | null {
  const base = line.meterageMode === "width_coeff" ? pos(line.width) : pos(line.meterage);
  if (base <= 0 || !Number.isFinite(meters) || meters <= 0) return null;
  return Math.round((meters / base) * 1e8) / 1e8 || null;
}

function recalcSewing(s: AtelierFabricSewing, metersNeeded: number): AtelierFabricSewing {
  const meters = s.metersManual ? round2(pos(s.meters)) : metersNeeded;
  if (s.pricing === "fixed") {
    return { ...s, meters, price: money(pos(s.price)), cost: money(pos(s.cost)) };
  }
  return {
    ...s,
    meters,
    price: money(meters * pos(s.ratePerMeter)),
    cost: money(meters * pos(s.costPerMeter)),
  };
}

function recalcTape(t: AtelierMountingTape, metersNeeded: number): AtelierMountingTape {
  const meters = t.metersManual ? round2(pos(t.meters)) : metersNeeded;
  if (!t.enabled) return { ...t, meters, price: 0, cost: 0 };
  return {
    ...t,
    meters,
    price: money(meters * pos(t.ratePerMeter)),
    cost: money(meters * pos(t.costPerMeter)),
  };
}

function recalcExtra(e: AtelierExtraLine): AtelierExtraLine {
  return {
    ...e,
    lineTotal: money(pos(e.quantity) * pos(e.salePerUnit)),
    lineCost: money(pos(e.quantity) * pos(e.costPerUnit)),
  };
}

function recalcPiece(raw?: AtelierPieceCharge | null): AtelierPieceCharge {
  const quantity = pos(raw?.quantity);
  const salePerUnit = pos(raw?.salePerUnit);
  const costPerUnit = pos(raw?.costPerUnit);
  return {
    quantity,
    salePerUnit,
    costPerUnit,
    price: money(quantity * salePerUnit),
    cost: money(quantity * costPerUnit),
  };
}

export function recalcFabricLine(line: AtelierFabricLine): AtelierFabricLine {
  const mode = line.meterageMode ?? "legacy";
  const meterage =
    mode === "width_coeff"
      ? round2(pos(line.width) * effectiveCoeff(line))
      : round2(pos(line.meterage));
  const metersNeeded =
    mode === "width_coeff"
      ? meterage
      : meterage > 0
        ? round2(meterage * effectiveCoeff(line))
        : 0;
  const lineTotal = money(metersNeeded * pos(line.salePerMeter));
  const lineCost = money(metersNeeded * pos(line.costPerMeter));
  const sewing = recalcSewing(line.sewing, metersNeeded);
  const tape = recalcTape(line.tape, metersNeeded);
  const extras = line.extras.map(recalcExtra);
  const grommets = recalcPiece(line.grommets);
  const loops = recalcPiece(line.loops);
  const install = { ...line.install, price: pos(line.install.price), cost: pos(line.install.cost) };
  const extrasSum = extras.reduce((s, e) => s + e.lineTotal, 0);
  const extrasCost = extras.reduce((s, e) => s + e.lineCost, 0);
  const total =
    lineTotal + sewing.price + tape.price + extrasSum + grommets.price + loops.price + install.price;
  const totalCost =
    lineCost + sewing.cost + tape.cost + extrasCost + grommets.cost + loops.cost + install.cost;
  return {
    ...line,
    meterage,
    metersNeeded,
    lineTotal,
    lineCost,
    sewing,
    tape,
    extras,
    grommets,
    loops,
    install,
    total,
    totalCost,
  };
}

type Priced = { lineTotal: number; lineCost: number; install: AtelierInstallLine };
const lineSale = (l: Priced) => l.lineTotal + num(l.install.price);
const lineCostOf = (l: Priced) => l.lineCost + num(l.install.cost);

export function recalcRoom(room: AtelierRoom): AtelierRoom {
  const tulle = room.tulle.map(recalcFabricLine);
  const portiere = room.portiere.map(recalcFabricLine);
  const cornices = room.cornices.map((c) => ({
    ...c,
    lineTotal: money(pos(c.meters) * pos(c.salePerMeter)),
    lineCost: money(pos(c.meters) * pos(c.costPerMeter)),
  }));
  const noInstall = { price: 0, cost: 0, showInKp: false };
  const covers = room.covers.map((c) => {
    const price = money(pos(c.salePrice));
    const sewingPrice = money(pos(c.sewingPrice));
    return {
      ...c,
      sewingPrice,
      lineTotal: price + sewingPrice,
      lineCost: money(pos(c.costPrice)),
      install: noInstall,
    };
  });
  const pillows = room.pillows.map((p) => {
    const qty = pos(p.quantity);
    const price = money(pos(p.materialSalePerMeter ?? p.salePrice));
    return {
      ...p,
      sewingPrice: money(pos(p.sewingPrice)),
      lineTotal: money(price * qty),
      lineCost: money(pos(p.costPrice) * qty),
      install: noInstall,
    };
  });
  const accessories = room.accessories.map((a) => {
    const install =
      a.kind === "side_hooks"
        ? {
            price: pos(a.install?.price),
            cost: pos(a.install?.cost),
            showInKp: a.install?.showInKp ?? true,
          }
        : noInstall;
    return {
      ...a,
      lineTotal: money(pos(a.salePrice) * pos(a.quantity)),
      lineCost: money(pos(a.costPrice) * pos(a.quantity)),
      install,
    };
  });
  const rollers = room.rollers.map((r) => {
    const sqm = r.width > 0 && r.height > 0 ? round2(r.width * r.height) : 0;
    return {
      ...r,
      sqm,
      lineTotal: money(sqm * pos(r.salePerSqm)),
      lineCost: money(sqm * pos(r.costPerSqm)),
    };
  });
  const blinds = (room.blinds ?? []).map((b) => recalcBlind(b));

  const fabrics = [...tulle, ...portiere];
  const others: Priced[] = [...cornices, ...covers, ...pillows, ...accessories, ...rollers, ...blinds];
  const subtotal =
    fabrics.reduce((s, l) => s + l.total, 0) + others.reduce((s, l) => s + lineSale(l), 0);
  const totalCost =
    fabrics.reduce((s, l) => s + l.totalCost, 0) + others.reduce((s, l) => s + lineCostOf(l), 0);

  return {
    ...room,
    tulle,
    portiere,
    cornices,
    covers,
    pillows,
    accessories,
    rollers,
    blinds,
    subtotal,
    totalCost,
  };
}

function recalcBlind(b: AtelierBlindLine): AtelierBlindLine {
  const sqm = pos(b.width) > 0 && pos(b.height) > 0 ? round2(pos(b.width) * pos(b.height)) : 0;
  const install = {
    price: pos(b.install?.price),
    cost: pos(b.install?.cost),
    showInKp: b.install?.showInKp ?? true,
  };
  return {
    ...b,
    sqm,
    lineTotal: money(sqm * pos(b.salePerSqm)),
    lineCost: money(sqm * pos(b.costPerSqm)),
    install,
  };
}

export function recalculateAtelierQuote(
  input: AtelierStoredQuote | AtelierQuoteSnapshot,
): AtelierQuoteSnapshot {
  const quote = normalizeAtelierQuote(input);
  const rooms = quote.rooms.map(recalcRoom);
  const subtotal = rooms.reduce((s, r) => s + r.subtotal, 0);
  const totalCost = rooms.reduce((s, r) => s + r.totalCost, 0);
  const discountPercent = Math.min(100, pos(quote.discountPercent));
  const discountAmount = money((subtotal * discountPercent) / 100);
  const total = subtotal - discountAmount;
  const grossProfit = total - totalCost;
  const marginPercent = total > 0 ? Math.round((grossProfit / total) * 1000) / 10 : 0;

  return {
    ...quote,
    rooms,
    discountPercent,
    subtotal,
    discountAmount,
    total,
    totalCost,
    grossProfit,
    marginPercent,
    calculatedAt: nowIso(),
    unitsVersion: 2,
  };
}

/** Quote limited to the given rooms, recalculated so totals and discount cover only them. */
export function selectQuoteRooms(
  quote: AtelierStoredQuote | AtelierQuoteSnapshot,
  roomIds: readonly string[],
): AtelierQuoteSnapshot {
  const full = normalizeAtelierQuote(quote);
  const ids = new Set(roomIds);
  return recalculateAtelierQuote({ ...full, rooms: full.rooms.filter((r) => ids.has(r.id)) });
}

export type RoomBreakdown = {
  /** Fabric and catalog goods */
  materials: number;
  sewing: number;
  /** Mounting tape, extra materials, installation */
  extras: number;
};

export function roomBreakdown(room: AtelierRoom): RoomBreakdown {
  const fabrics = [...room.tulle, ...room.portiere];
  const others: Priced[] = [
    ...room.cornices,
    ...room.covers,
    ...room.pillows,
    ...room.accessories,
    ...room.rollers,
  ];
  return {
    materials:
      fabrics.reduce((s, l) => s + l.lineTotal, 0) + others.reduce((s, l) => s + l.lineTotal, 0),
    sewing: fabrics.reduce((s, l) => s + l.sewing.price, 0),
    extras:
      fabrics.reduce(
        (s, l) =>
          s +
          l.tape.price +
          l.install.price +
          (l.grommets?.price ?? 0) +
          (l.loops?.price ?? 0) +
          l.extras.reduce((a, e) => a + e.lineTotal, 0),
        0,
      ) + others.reduce((s, l) => s + num(l.install.price), 0),
  };
}

export function roomHasContent(room: AtelierRoom): boolean {
  return (
    room.subtotal > 0 ||
    room.tulle.length +
      room.portiere.length +
      room.cornices.length +
      room.covers.length +
      room.pillows.length +
      room.accessories.length +
      room.rollers.length +
      (room.blinds?.length ?? 0) >
      0
  );
}

/* ─── Commercial proposal document ─── */

export type ProposalDocRow = {
  name: string;
  specs: string;
  qty: number;
  unit: string;
  price: number;
  note?: string;
};

export type ProposalDocSection = {
  title: string;
  rows: ProposalDocRow[];
  subtotal: number;
};

export type ProposalDocRoom = {
  name: string;
  sections: ProposalDocSection[];
  breakdown: RoomBreakdown;
  subtotal: number;
  curtainStyleIds?: string[];
};

export type ProposalDocument = {
  rooms: ProposalDocRoom[];
  measurementDate: string | null;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
};

/**
 * `internal` is the measurement sheet and keeps every size.
 * `client` is the commercial proposal: names, materials and prices only.
 */
export type ProposalAudience = "internal" | "client";

function joinSpecs(parts: (string | null | undefined | false)[]): string {
  return parts.filter((part): part is string => Boolean(part)).join(", ");
}

function fabricRows(
  kind: AtelierFabricKind,
  lines: AtelierFabricLine[],
  labels: AtelierLabels,
  client: boolean,
  withInstall: (section: InstallSection, install: AtelierInstallLine, total: number) => number,
): ProposalDocRow[] {
  const rows: ProposalDocRow[] = [];
  const kindLabel = FABRIC_KIND_LABELS[kind];
  lines.forEach((l, i) => {
    const title = `${kindLabel} №${i + 1}`;
    const coeff = effectiveCoeff(l);
    if (l.metersNeeded > 0 || l.lineTotal > 0 || l.fabricName) {
      rows.push({
        name: `${title}${l.fabricName ? ` — ${l.fabricName}` : ""}`,
        specs: client
          ? ""
          : joinSpecs([
              l.width || l.height ? `Ш × В: ${formatSizeM(l.width, l.height)}` : null,
              `метраж ${formatMeters(l.meterage, "п.м.")}`,
              l.showCoeffInKp && coeff !== 1 ? `коэфф. сборки ×${formatNumberRu(coeff)}` : null,
              coeff !== 1 ? `расход ${formatMeters(l.metersNeeded, "п.м.")}` : null,
              l.salePerMeter ? `${formatKzt(l.salePerMeter)}/п.м.` : null,
            ]),
        qty: l.metersNeeded,
        unit: "п.м.",
        price: withInstall("curtains", l.install, l.lineTotal),
        note: client ? undefined : l.note?.trim() || undefined,
      });
    } else if (l.install.price) {
      withInstall("curtains", l.install, 0);
    }
    if (l.sewing.price > 0) {
      const fixed = l.sewing.pricing === "fixed";
      rows.push({
        name: `${labels["sewing.title"]} — ${title.toLowerCase()}`,
        specs: client || fixed ? "" : `${formatMeters(l.sewing.meters, "п.м.")} × ${formatKzt(l.sewing.ratePerMeter)}/п.м.`,
        qty: fixed ? 1 : l.sewing.meters,
        unit: fixed ? "усл." : "п.м.",
        price: l.sewing.price,
      });
    }
    if (l.tape.enabled && l.tape.price > 0) {
      rows.push({
        name: `${labels["sewing.tape"]} — ${title.toLowerCase()}`,
        specs: client ? "" : `${formatMeters(l.tape.meters, "п.м.")} × ${formatKzt(l.tape.ratePerMeter)}/п.м.`,
        qty: l.tape.meters,
        unit: "п.м.",
        price: l.tape.price,
      });
    }
    for (const piece of [
      { charge: l.grommets, name: `Люверсы — ${title.toLowerCase()}` },
      { charge: l.loops, name: `Петли — ${title.toLowerCase()}` },
    ]) {
      if (!piece.charge || piece.charge.price <= 0) continue;
      rows.push({
        name: piece.name,
        specs: client ? "" : `${formatNumberRu(piece.charge.quantity)} шт × ${formatKzt(piece.charge.salePerUnit)}`,
        qty: piece.charge.quantity,
        unit: "шт",
        price: piece.charge.price,
      });
    }
    for (const e of l.extras) {
      if (!e.lineTotal && !e.name) continue;
      rows.push({
        name: e.name || "Дополнительный материал",
        specs: client ? "" : `${title.toLowerCase()}, ${formatNumberRu(e.quantity)} ${e.unit} × ${formatKzt(e.salePerUnit)}`,
        qty: e.quantity,
        unit: e.unit,
        price: e.lineTotal,
      });
    }
  });
  return rows;
}

/** КП order: cornices, tulle, curtain fabrics, then everything else in its original order. */
const PROPOSAL_SECTION_RANK: Record<string, number> = {
  Карнизы: 0,
  Тюль: 1,
  Портьера: 2,
};

export function sortProposalSections<T extends { title: string }>(sections: T[]): T[] {
  const rank = (t: string) => PROPOSAL_SECTION_RANK[t] ?? 3;
  return sections
    .map((section, index) => ({ section, index }))
    .sort((a, b) => rank(a.section.title) - rank(b.section.title) || a.index - b.index)
    .map((x) => x.section);
}

function buildRoomDocument(room: AtelierRoom, labels: AtelierLabels, client: boolean): ProposalDocRoom {
  const works = new Map<string, { qty: number; price: number }>();

  /** Visible installs go to the works section; hidden ones fold into their line so totals still add up. */
  function withInstall(
    section: InstallSection,
    install: AtelierInstallLine,
    lineTotal: number,
  ): number {
    if (!install.price) return lineTotal;
    if (!install.showInKp) return lineTotal + install.price;
    const name = installLabel(labels, section);
    const prev = works.get(name) ?? { qty: 0, price: 0 };
    works.set(name, { qty: prev.qty + 1, price: prev.price + install.price });
    return lineTotal;
  }

  const sections: ProposalDocSection[] = [];
  const push = (title: string, rows: ProposalDocRow[]) => {
    if (!rows.length) return;
    const visible = client
      ? rows.map((row) => ({ ...row, qty: 1, unit: "", note: undefined }))
      : rows;
    sections.push({ title, rows: visible, subtotal: visible.reduce((s, r) => s + r.price, 0) });
  };

  push("Тюль", fabricRows("tulle", room.tulle, labels, client, withInstall));
  push("Портьера", fabricRows("portiere", room.portiere, labels, client, withInstall));

  push(
    "Карнизы",
    room.cornices.map((c) => ({
      name: c.label,
      specs: joinSpecs([
        client ? null : `Длина ${formatMeters(c.meters)}`,
        c.forgedColor ? `цвет ${ATELIER_FORGED_COLOR_LABELS[c.forgedColor].toLowerCase()}` : null,
      ]),
      qty: c.meters,
      unit: "п.м.",
      price: withInstall("cornice", c.install, c.lineTotal),
    })),
  );

  push(
    "Покрывала",
    room.covers.map((c, i) => ({
      name: `Покрывало №${i + 1} — ${COVER_TYPE_LABELS[c.coverType]}`,
      specs: joinSpecs([
        client ? null : formatSizeM(c.width, c.length),
        client || !c.overhang ? null : `провис ${formatMeters(c.overhang)}`,
        c.materialKind
          ? `${c.materialKind === "sintepon" ? "синтепон" : "ткань"}${c.materialName ? ` ${c.materialName}` : ""}`
          : null,
        `стежка «${COVER_STITCH_LABELS[c.stitch]}»`,
        `угол ${COVER_CORNER_LABELS[c.corner].toLowerCase()}`,
      ]),
      qty: 1,
      unit: "шт",
      price: withInstall("covers", c.install, c.lineTotal),
    })),
  );

  push(
    "Подушки",
    room.pillows.map((p, i) => ({
      name: `Подушка №${i + 1} — ${p.pillowType === "cover" ? "наволочка" : "полный комплект"}`,
      specs: joinSpecs([
        client ? null : formatSizeM(p.width, p.height),
        client ? null : p.note || null,
        p.fillingName ? `наполнитель ${p.fillingName}` : null,
      ]),
      qty: p.quantity,
      unit: "шт",
      price: withInstall("pillows", p.install, p.lineTotal),
      note: client ? undefined : p.note?.trim() || undefined,
    })),
  );

  push(
    "Аксессуары",
    room.accessories.map((a) => ({
      name: a.label,
      specs: `цвет ${ACCESSORY_COLOR_LABELS[a.color].toLowerCase()}`,
      qty: a.quantity,
      unit: "шт",
      price: withInstall("accessories", a.install, a.lineTotal),
    })),
  );

  push(
    "Ролл-шторы",
    room.rollers.map((r, i) => ({
      name: `Ролл-штора №${i + 1} — ${ROLLER_PANEL_LABELS[r.panel]}`,
      specs: joinSpecs([
        client ? null : `Ш × В: ${formatSizeM(r.width, r.height)}`,
        `крепление: ${ROLLER_MOUNT_LABELS[r.mount].toLowerCase()}`,
        `механизм: ${ROLLER_MECH_LABELS[r.mechanismColor].toLowerCase()}`,
      ]),
      qty: r.sqm,
      unit: "м²",
      price: withInstall("rollers", r.install, r.lineTotal),
    })),
  );

  push(
    "Жалюзи",
    (room.blinds ?? []).flatMap((b, i) => {
      const rows: ProposalDocRow[] = [
        {
          name: `Жалюзи №${i + 1} — ${ATELIER_BLIND_LABELS[b.kind]}`,
          specs: client ? "" : `Ш × В: ${formatSizeM(b.width, b.height)}`,
          qty: b.sqm,
          unit: "м²",
          price: b.lineTotal,
          note: client ? undefined : b.note?.trim() || undefined,
        },
      ];
      if (b.install?.price) {
        rows.push({
          name: `Установка — жалюзи №${i + 1}`,
          specs: "",
          qty: 1,
          unit: "усл.",
          price: b.install.price,
        });
      }
      return rows;
    }),
  );

  push(
    "Дополнительные работы и услуги",
    [...works.entries()].map(([name, w]) => ({
      name,
      specs: "",
      qty: w.qty,
      unit: "усл.",
      price: w.price,
    })),
  );

  return {
    name: room.name.trim() || "Без названия",
    sections: sortProposalSections(sections),
    breakdown: roomBreakdown(room),
    subtotal: room.subtotal,
    curtainStyleIds: room.curtainStyleIds,
  };
}

export function buildAtelierProposalDocument(
  input: AtelierStoredQuote | AtelierQuoteSnapshot,
  audience: ProposalAudience = "internal",
): ProposalDocument {
  const quote = recalculateAtelierQuote(input);
  const labels = resolveAtelierLabels(quote.labels);
  const client = audience === "client";
  return {
    rooms: quote.rooms.map((r) => buildRoomDocument(r, labels, client)),
    measurementDate: quote.measurementDate ?? null,
    subtotal: quote.subtotal,
    discountPercent: quote.discountPercent,
    discountAmount: quote.discountAmount,
    total: quote.total,
  };
}

/** Flat KP line items (legacy `items` field and furniture-compatible PDF) */
export function atelierQuoteToProposalItems(
  quote: AtelierStoredQuote | AtelierQuoteSnapshot,
): {
  name: string;
  qty: number;
  specs: string;
  price: number;
}[] {
  const doc = buildAtelierProposalDocument(quote, "client");
  const prefixRooms = doc.rooms.length > 1;
  const items = doc.rooms.flatMap((room) =>
    room.sections.flatMap((s) =>
      s.rows.map((r) => ({
        name: prefixRooms ? `${room.name}: ${r.name}` : r.name,
        qty: 1,
        specs: r.specs,
        price: r.price,
      })),
    ),
  );
  if (doc.discountPercent > 0) {
    items.push({
      name: `Скидка ${doc.discountPercent}%`,
      qty: 1,
      specs: "",
      price: -doc.discountAmount,
    });
  }
  return items;
}

export type {
  AtelierCorniceLine,
  AtelierCoverLine,
  AtelierPillowLine,
  AtelierAccessoryLine,
  AtelierRollerLine,
  AtelierFabricLine,
  AtelierRoom,
};
