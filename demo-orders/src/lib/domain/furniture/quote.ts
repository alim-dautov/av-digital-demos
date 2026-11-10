import type {
  FurnitureCostLine,
  FurnitureCountKey,
  FurnitureQuickEstimate,
  FurnitureQuickTariff,
  FurnitureFacadeMaterial,
  FurnitureFacadePiece,
  FurnitureModule,
  FurnitureModulePrice,
  FurniturePart,
  FurniturePriceItem,
  FurnitureQuoteResult,
  FurnitureQuoteSnapshot,
  NestedSheet,
} from "@/types";
import { nowIso } from "@/lib/utils";
import {
  MODULE_TEMPLATES,
  moduleFacades,
  moduleHardware,
  moduleLabel,
  moduleParts,
} from "./modules";
import { nestParts } from "./nesting";

export const FACADE_MATERIAL_LABELS: Record<FurnitureFacadeMaterial, string> = {
  none: "Без фасадов",
  ldsp: "ЛДСП (в раскрой)",
  egger: "ЛДСП EGGER (себестоимость вручную)",
  mdf_film: "Плёночный МДФ",
  mdf_paint: "Крашеный МДФ, гладкий",
  mdf_multicam: "Крашеный МДФ, мультикам",
  mdf_fluted: "Крашеный МДФ, рифлёный",
  veneer_1: "Шпон, односторонний",
  veneer_2: "Шпон, двухсторонний",
};

export const QUICK_TARIFFS: Record<
  FurnitureQuickTariff,
  { label: string; baseRate: number; heightStepRate: number }
> = {
  ldsp_budget: { label: "ЛДСП бюджет", baseRate: 150_000, heightStepRate: 10_000 },
  ldsp_standard: { label: "ЛДСП стандарт", baseRate: 175_000, heightStepRate: 10_000 },
  mdf_paint: { label: "Крашеный МДФ", baseRate: 220_000, heightStepRate: 17_500 },
};

export function calculateQuickFurnitureEstimate(input: FurnitureQuickEstimate) {
  const tariff = QUICK_TARIFFS[input.tariff] ?? QUICK_TARIFFS.ldsp_budget;
  const linearMeters = Math.max(0, input.linearMeters || 0);
  const heightMeters = Math.max(0, input.heightMeters || 0);
  // Work in millimetres to avoid 2.6 - 2.5 becoming 0.10000000000000009.
  const heightSteps = Math.max(0, Math.ceil((heightMeters * 1000 - 2500) / 100 - 1e-9));
  const rate = tariff.baseRate + heightSteps * tariff.heightStepRate;
  return {
    tariff,
    linearMeters,
    heightMeters,
    heightSteps,
    rate,
    subtotal: Math.round(linearMeters * rate),
  };
}

const SQM_FACADES: FurnitureFacadeMaterial[] = [
  "mdf_film",
  "mdf_paint",
  "mdf_multicam",
  "mdf_fluted",
  "veneer_1",
  "veneer_2",
];

export function isSqmFacade(m: FurnitureFacadeMaterial): boolean {
  return SQM_FACADES.includes(m);
}

export const COUNT_LABELS: Record<FurnitureCountKey, string> = {
  hdfSheets: "ХДФ, листов",
  countertopSheets: "Столешница, листов",
  hinges: "Петли, шт",
  slides: "Направляющие, компл.",
  legs: "Ножки, шт",
  crabs: "Крабы, шт",
  edgeMeters: "Кромка, м",
};

const DEFAULT_SHEET: [number, number] = [2750, 1830];
const EDGE_WASTE = 1.1;

type PriceIndex = {
  byId: Map<string, FurniturePriceItem>;
  byCode: Map<string, FurniturePriceItem>;
  list: FurniturePriceItem[];
};

function indexPrices(prices: FurniturePriceItem[]): PriceIndex {
  return {
    byId: new Map(prices.map((p) => [p.id, p])),
    byCode: new Map(prices.map((p) => [p.code, p])),
    list: prices,
  };
}

function firstOf(prices: FurniturePriceItem[], category: FurniturePriceItem["category"]) {
  return prices.find((p) => p.category === category && p.active) ?? null;
}

export function emptyFurnitureQuote(
  prices: FurniturePriceItem[],
  partial?: Partial<FurnitureQuoteSnapshot>,
): FurnitureQuoteSnapshot {
  const idx = indexPrices(prices);
  const carcass = idx.byCode.get("ldsp_lamarty") ?? firstOf(prices, "ldsp");
  return {
    clientId: null,
    clientName: "",
    clientPhone: "",
    address: "",
    deadline: "",
    projectName: "Кухня",
    calculationMode: "quick",
    quickEstimate: { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" },
    modules: [],
    carcassMaterialId: carcass?.id ?? "",
    facadeMaterial: "ldsp",
    facadeSheetMaterialId: null,
    eggerFacadeCost: 0,
    countertop: "ldsp",
    countertopManualCost: 0,
    hingeItemId: (idx.byCode.get("hinge_boyard_soft") ?? firstOf(prices, "hinge"))?.id ?? null,
    slideItemId: (idx.byCode.get("slide_en7_telescope") ?? firstOf(prices, "slide"))?.id ?? null,
    allowRotation: true,
    includeTransport: true,
    extras: [],
    overrides: { counts: {}, sheets: {} },
    coefficient: 2,
    discountPercent: 0,
    result: null,
    subtotal: 0,
    discountAmount: 0,
    total: 0,
    totalCost: 0,
    grossProfit: 0,
    marginPercent: 0,
    calculatedAt: null,
    ...partial,
  };
}

/** Sold as their own KP lines instead of being spread across module prices. */
function isSeparateLine(key: string): boolean {
  return key === "countertop" || key.startsWith("extra:");
}

/** Splits the module sale pool by part area; a module's own price replaces its share. */
function priceModules(
  modules: FurnitureModule[],
  parts: FurniturePart[],
  pool: number,
): Record<string, FurnitureModulePrice> {
  const weights = modules.map((m) =>
    Math.max(
      1,
      parts
        .filter((p) => p.moduleId === m.id)
        .reduce((s, p) => s + p.length * p.width * p.quantity, 0),
    ),
  );
  const weightSum = weights.reduce((s, w) => s + w, 0) || 1;
  const prices: Record<string, FurnitureModulePrice> = {};
  modules.forEach((m, i) => {
    const calculated = Math.round((pool * weights[i]) / weightSum / Math.max(1, m.quantity));
    const own = m.price != null && m.price > 0 ? Math.round(m.price) : null;
    prices[m.id] = { calculated, price: own ?? calculated };
  });
  return prices;
}

function sumWidth(modules: FurnitureModule[], kinds: FurnitureModule["kind"][]): number {
  return modules
    .filter((m) => kinds.includes(m.kind))
    .reduce((s, m) => s + m.width * m.quantity, 0);
}

/** ТЗ: кухня до 3 м — 1 лист, до 5 м — 2, больше — 3; шкаф до 1800 — 1, до 4 м — 2, от 4 м — 3. */
export function hdfSheetsFor(kitchenLength: number, wardrobeWidth: number): number {
  let sheets = 0;
  if (kitchenLength > 0) sheets += kitchenLength <= 3000 ? 1 : kitchenLength <= 5000 ? 2 : 3;
  if (wardrobeWidth > 0) sheets += wardrobeWidth <= 1800 ? 1 : wardrobeWidth < 4000 ? 2 : 3;
  return sheets;
}

export function countertopSheetsFor(baseRunLength: number): number {
  if (baseRunLength <= 0) return 0;
  return baseRunLength <= 3000 ? 1 : 2;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pickCount(
  key: FurnitureCountKey,
  auto: Record<FurnitureCountKey, number>,
  overrides: FurnitureQuoteSnapshot["overrides"],
): number {
  const o = overrides.counts[key];
  return typeof o === "number" && o >= 0 ? o : auto[key];
}

function line(
  key: string,
  label: string,
  quantity: number,
  unit: string,
  unitPrice: number,
): FurnitureCostLine {
  return {
    key,
    label,
    quantity,
    unit,
    unitPrice,
    total: Math.round(quantity * unitPrice),
  };
}

export function recalculateFurnitureQuote(
  input: FurnitureQuoteSnapshot,
  prices: FurniturePriceItem[],
): FurnitureQuoteSnapshot {
  const quote: FurnitureQuoteSnapshot = {
    ...input,
    calculationMode: input.calculationMode ?? "detailed",
    quickEstimate: input.quickEstimate ?? { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" },
    overrides: {
      counts: input.overrides?.counts ?? {},
      sheets: input.overrides?.sheets ?? {},
    },
    extras: input.extras ?? [],
  };

  if (quote.calculationMode === "quick") {
    const estimate = calculateQuickFurnitureEstimate(
      quote.quickEstimate ?? { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" },
    );
    const discountPercent = Math.min(100, Math.max(0, quote.discountPercent || 0));
    const discountAmount = Math.round((estimate.subtotal * discountPercent) / 100);
    const total = estimate.subtotal - discountAmount;
    return {
      ...quote,
      discountPercent,
      result: null,
      subtotal: estimate.subtotal,
      discountAmount,
      total,
      totalCost: 0,
      grossProfit: 0,
      marginPercent: 0,
      calculatedAt: nowIso(),
    };
  }
  const idx = indexPrices(prices);
  const warnings: string[] = [];

  const carcass =
    idx.byId.get(quote.carcassMaterialId) ??
    idx.byCode.get("ldsp_lamarty") ??
    firstOf(prices, "ldsp");
  const carcassId = carcass?.id ?? "carcass";
  const facadeSheet =
    quote.facadeMaterial === "ldsp"
      ? (quote.facadeSheetMaterialId && idx.byId.get(quote.facadeSheetMaterialId)) || carcass
      : null;
  const facadeSheetId = facadeSheet ? facadeSheet.id : null;

  const parts: FurniturePart[] = [];
  const facades: FurnitureFacadePiece[] = [];
  const hw = { hinges: 0, slides: 0, legs: 0, crabs: 0 };
  let edgeMm = 0;

  quote.modules.forEach((m, i) => {
    const label = moduleLabel(m, i);
    const mParts = moduleParts(m, label, carcassId, facadeSheetId);
    parts.push(...mParts);
    for (const p of mParts) edgeMm += p.edge * p.quantity;
    if (quote.facadeMaterial !== "none") facades.push(...moduleFacades(m));
    const h = moduleHardware(m);
    hw.hinges += h.hinges;
    hw.slides += h.slides;
    hw.legs += h.legs;
    hw.crabs += h.crabs;
  });

  const materialIds = [...new Set(parts.map((p) => p.materialId))];
  const sheets: NestedSheet[] = [];
  const nestedSheetCounts: Record<string, number> = {};
  for (const materialId of materialIds) {
    const material = idx.byId.get(materialId);
    const [sw, sh] =
      material?.sheetWidth && material.sheetHeight
        ? [material.sheetWidth, material.sheetHeight]
        : DEFAULT_SHEET;
    const nested = nestParts(
      parts.filter((p) => p.materialId === materialId),
      { sheetWidth: sw, sheetHeight: sh, allowRotation: quote.allowRotation },
    );
    for (const o of nested.oversized) warnings.push(`Деталь не помещается на лист: ${o}`);
    nestedSheetCounts[materialId] = nested.sheets.length;
    sheets.push(...nested.sheets.map((s) => ({ ...s, materialId })));
  }

  const kitchenLength = Math.max(
    sumWidth(quote.modules, ["base"]),
    sumWidth(quote.modules, ["wall"]),
    sumWidth(quote.modules, ["mezzanine"]),
  );
  const wardrobeWidth = sumWidth(quote.modules, ["tall"]);
  const baseRunLength = sumWidth(quote.modules, ["base"]);

  const autoCounts: Record<FurnitureCountKey, number> = {
    hdfSheets: hdfSheetsFor(kitchenLength, wardrobeWidth),
    countertopSheets: quote.countertop === "ldsp" ? countertopSheetsFor(baseRunLength) : 0,
    hinges: quote.facadeMaterial === "none" ? 0 : hw.hinges,
    slides: hw.slides,
    legs: hw.legs,
    crabs: hw.crabs,
    edgeMeters: Math.ceil((edgeMm / 1000) * EDGE_WASTE),
  };
  const counts = Object.fromEntries(
    (Object.keys(autoCounts) as FurnitureCountKey[]).map((k) => [
      k,
      pickCount(k, autoCounts, quote.overrides),
    ]),
  ) as Record<FurnitureCountKey, number>;

  const facadeAreaSqm = round2(
    facades.reduce((s, f) => s + (f.height * f.width * f.quantity) / 1_000_000, 0),
  );

  const costLines: FurnitureCostLine[] = [];
  let ldspSheetsTotal = 0;
  for (const materialId of materialIds) {
    const material = idx.byId.get(materialId);
    const override = quote.overrides.sheets[materialId];
    const qty =
      typeof override === "number" && override >= 0 ? override : nestedSheetCounts[materialId];
    ldspSheetsTotal += qty;
    costLines.push(
      line(`sheet:${materialId}`, material?.name ?? "ЛДСП", qty, "лист", material?.price ?? 0),
    );
  }

  if (isSqmFacade(quote.facadeMaterial) && facadeAreaSqm > 0) {
    const item = idx.byCode.get(quote.facadeMaterial);
    costLines.push(
      line("facade", `Фасады: ${item?.name ?? FACADE_MATERIAL_LABELS[quote.facadeMaterial]}`, facadeAreaSqm, "м²", item?.price ?? 0),
    );
  }
  if (quote.facadeMaterial === "egger" && quote.eggerFacadeCost > 0) {
    costLines.push(line("facade", "Фасады: ЛДСП EGGER", 1, "компл.", quote.eggerFacadeCost));
  }

  const priced = (key: string, code: string | null, itemId: string | null, qty: number, unit: string) => {
    if (qty <= 0) return;
    const item = itemId ? idx.byId.get(itemId) : code ? idx.byCode.get(code) : undefined;
    if (!item) return;
    costLines.push(line(key, item.name, qty, unit, item.price));
  };

  priced("hdf", "hdf", null, counts.hdfSheets, "лист");
  priced("edge", "edge", null, counts.edgeMeters, "м");
  priced("sawing", "sawing", null, ldspSheetsTotal, "лист");
  priced("hinges", null, quote.hingeItemId, counts.hinges, "шт");
  priced("slides", null, quote.slideItemId, counts.slides, "компл.");
  priced("legs", "leg", null, counts.legs, "шт");
  priced("crabs", "crab", null, counts.crabs, "шт");

  if (quote.countertop === "ldsp") {
    priced("countertop", "countertop_ldsp", null, counts.countertopSheets, "лист");
  } else if (quote.countertop === "manual" && quote.countertopManualCost > 0) {
    costLines.push(line("countertop", "Столешница", 1, "шт", quote.countertopManualCost));
  }

  for (const e of quote.extras) {
    if (e.quantity > 0 && e.unitPrice > 0) {
      costLines.push(line(`extra:${e.id}`, e.name || "Доп. позиция", e.quantity, "шт", e.unitPrice));
    }
  }

  if (quote.includeTransport && quote.modules.length > 0) {
    priced("transport", "transport", null, 1, "рейс");
  }

  const pieceCount = parts.reduce((s, p) => s + p.quantity, 0);
  if (quote.modules.length > 0 && pieceCount === 0) warnings.push("Нет деталей для раскроя");

  const totalCost = costLines.reduce((s, l) => s + l.total, 0);
  const coefficient = quote.coefficient > 0 ? quote.coefficient : 1;
  const separateSale = costLines
    .filter((l) => isSeparateLine(l.key))
    .reduce((s, l) => s + Math.round(l.total * coefficient), 0);
  const modulePool = Math.max(0, Math.round(totalCost * coefficient) - separateSale);
  const modulePrices = priceModules(quote.modules, parts, modulePool);
  const modulesSale = quote.modules.reduce(
    (s, m) => s + (modulePrices[m.id]?.price ?? 0) * m.quantity,
    0,
  );

  const subtotal = modulesSale + separateSale;
  const discountPercent = Math.min(100, Math.max(0, quote.discountPercent || 0));
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const total = subtotal - discountAmount;
  const grossProfit = total - totalCost;
  const marginPercent = total > 0 ? Math.round((grossProfit / total) * 1000) / 10 : 0;

  const result: FurnitureQuoteResult = {
    kitchenLength,
    wardrobeWidth,
    baseRunLength,
    parts,
    facades,
    facadeAreaSqm,
    sheets,
    nestedSheetCounts,
    autoCounts,
    counts,
    costLines,
    modulePrices,
    warnings,
  };

  return {
    ...quote,
    coefficient,
    discountPercent,
    result,
    subtotal,
    discountAmount,
    total,
    totalCost,
    grossProfit,
    marginPercent,
    calculatedAt: nowIso(),
  };
}

/** Client-facing KP lines: module prices share the project price by material weight. */
export function furnitureQuoteToProposalItems(quote: FurnitureQuoteSnapshot): {
  name: string;
  qty: number;
  specs: string;
  price: number;
}[] {
  if (quote.calculationMode === "quick") {
    const estimate = calculateQuickFurnitureEstimate(
      quote.quickEstimate ?? { linearMeters: 0, heightMeters: 2.5, tariff: "ldsp_budget" },
    );
    const items = [
      {
        name: quote.projectName || "Корпусная мебель",
        qty: estimate.linearMeters,
        specs: `${estimate.tariff.label} · высота ${estimate.heightMeters} м · ${estimate.rate} ₸/п.м.`,
        price: estimate.subtotal,
      },
    ];
    if (quote.discountPercent > 0) {
      items.push({
        name: `Скидка ${quote.discountPercent}%`,
        qty: 1,
        specs: "",
        price: -quote.discountAmount,
      });
    }
    return items;
  }
  const r = quote.result;
  if (!r) return [];
  const coef = quote.coefficient;

  const facadeNote =
    quote.facadeMaterial === "none"
      ? ""
      : `, фасад: ${FACADE_MATERIAL_LABELS[quote.facadeMaterial].replace(/ \(.*\)$/, "").toLowerCase()}`;
  const items: { name: string; qty: number; specs: string; price: number }[] = [];
  for (const m of quote.modules) {
    const t = MODULE_TEMPLATES[m.kind];
    items.push({
      name: moduleLabel(m).replace(/^\d+\.\s/, "").replace(t.shortLabel, t.label),
      qty: m.quantity,
      specs: `${m.height}×${m.width}×${m.depth} мм${facadeNote}`,
      price: (r.modulePrices?.[m.id]?.price ?? 0) * m.quantity,
    });
  }

  for (const l of r.costLines.filter((line) => isSeparateLine(line.key))) {
    items.push({
      name: l.label,
      qty: l.quantity,
      specs: l.unit,
      price: Math.round(l.total * coef),
    });
  }

  if (quote.discountPercent > 0) {
    items.push({
      name: `Скидка ${quote.discountPercent}%`,
      qty: 1,
      specs: "",
      price: -quote.discountAmount,
    });
  }
  return items;
}
