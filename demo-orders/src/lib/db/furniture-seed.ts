import type {
  AppData,
  FurniturePriceCategory,
  FurniturePriceItem,
  FurniturePriceUnit,
} from "@/types";
import { MEBELDEMO_ID } from "@/lib/utils";

type SeedRow = [
  code: string,
  category: FurniturePriceCategory,
  name: string,
  unit: FurniturePriceUnit,
  price: number,
  sheet?: [number, number],
];

/** Source: «Просчет таблица Актуальный прайс.xlsx» + ТЗ калькулятора */
const ROWS: SeedRow[] = [
  ["ldsp_lamarty", "ldsp", "LAMARTY — Российский ЛДСП", "sheet", 17000, [2750, 1830]],
  ["ldsp_egger_plain", "ldsp", "EGGER — Австрийский ЛДСП (Однотонный)", "sheet", 32000, [2800, 2070]],
  ["ldsp_egger_wood", "ldsp", "EGGER — Австрийский ЛДСП (Древесный)", "sheet", 36000, [2800, 2070]],
  ["ldsp_kronospan_s", "ldsp", "KRONOSPAN — Австрийский ЛДСП (S)", "sheet", 23000, [2500, 1830]],
  ["ldsp_kronospan_m", "ldsp", "KRONOSPAN — Австрийский ЛДСП (M)", "sheet", 29900, [2750, 1830]],
  ["ldsp_kronospan_l", "ldsp", "KRONOSPAN — Австрийский ЛДСП (L)", "sheet", 35000, [2800, 2070]],
  ["mdf_agt", "mdf_sheet", "AGT — Турецкий МДФ", "sheet", 40000, [2800, 1220]],
  ["mdf_glodeco", "mdf_sheet", "GLODECO — Корейский МДФ", "sheet", 35000, [2400, 1220]],
  ["mdf_film", "facade_sqm", "Плёночный МДФ (Гладкий)", "sqm", 23000],
  ["mdf_paint", "facade_sqm", "Крашеный МДФ (Гладкий)", "sqm", 29000],
  ["mdf_multicam", "facade_sqm", "Крашеный МДФ (Мультикам)", "sqm", 30000],
  ["mdf_fluted", "facade_sqm", "Крашеный МДФ (Рифлёный)", "sqm", 45000],
  ["veneer_1", "facade_sqm", "Шпонированный МДФ (Односторонний)", "sqm", 75000],
  ["veneer_2", "facade_sqm", "Шпонированный МДФ (Двухсторонний)", "sqm", 125000],
  ["hdf", "hdf", "ХДФ", "sheet", 7500, [2500, 2070]],
  ["edge", "edge", "Кромка", "m", 200],
  ["sawing", "service", "Распил", "sheet", 2000],
  ["fixes", "service", "Фиксы и прочее", "pcs", 5000],
  ["transport", "service", "Транспортные расходы", "pcs", 15000],
  ["countertop_ldsp", "countertop", "Столешница ЛДСП", "sheet", 35000],
  ["hinge_en7", "hinge", "Навесы: en7 (обычные)", "pcs", 250],
  ["hinge_boyard_soft", "hinge", "Навесы: Boyard (с доводчиками)", "pcs", 500],
  ["hinge_hafele", "hinge", "Навесы: HAFELE — Германия (без доводчиков)", "pcs", 700],
  ["hinge_hafele_soft", "hinge", "Навесы: HAFELE — Германия (с доводчиками)", "pcs", 780],
  ["hinge_blum", "hinge", "Навесы: BLUM — Австрия (без доводчиков)", "pcs", 900],
  ["hinge_blum_soft", "hinge", "Навесы: BLUM — Австрия (с доводчиками)", "pcs", 1800],
  ["slide_en7_telescope", "slide", "Направляющие: en7 (Телескоп)", "pcs", 2000],
  ["slide_en7_tandem", "slide", "Направляющие: en7 (Tandem)", "pcs", 4500],
  ["slide_hafele_telescope", "slide", "Направляющие: HAFELE — Германия (Телескоп)", "pcs", 3200],
  ["slide_hafele_tandem", "slide", "Направляющие: HAFELE — Германия (Tandem)", "pcs", 5000],
  ["slide_blum_motion", "slide", "Направляющие: BLUM Blumotion, частичка без замка", "pcs", 7000],
  ["slide_blum_motion_lock", "slide", "Направляющие: BLUM Blumotion, частичка с замком", "pcs", 9000],
  ["slide_blum_tipon_lock", "slide", "Направляющие: BLUM Tip-on, частичка с замком", "pcs", 14000],
  ["slide_blum_tipon_motion", "slide", "Направляющие: BLUM Tip-on + Blumotion, частичка с замком", "pcs", 20000],
  ["slide_antaro_motion_70", "slide", "Направляющие: BLUM Tandembox Antaro Blumotion H70", "pcs", 22000],
  ["slide_antaro_tipon_70", "slide", "Направляющие: BLUM Tandembox Antaro Tip-on H70", "pcs", 23000],
  ["slide_antaro_both_70", "slide", "Направляющие: BLUM Tandembox Antaro Blumotion + Tip-on H70", "pcs", 27000],
  ["slide_antaro_motion_240", "slide", "Направляющие: BLUM Tandembox Antaro Blumotion H240", "pcs", 28000],
  ["slide_antaro_tipon_240", "slide", "Направляющие: BLUM Tandembox Antaro Tip-on H240", "pcs", 32000],
  ["slide_antaro_both_240", "slide", "Направляющие: BLUM Tandembox Antaro Blumotion + Tip-on H240", "pcs", 36000],
  ["lift_gas_1", "lift", "Подъёмник: газлифт 120 (комплект 1 шт)", "pcs", 1000],
  ["lift_gas_2", "lift", "Подъёмник: газлифт 120 (комплект 2 шт)", "pcs", 2000],
  ["lift_hkxs_1", "lift", "Подъёмник: BLUM Aventos HK-XS (комплект 1 шт)", "pcs", 11000],
  ["lift_hkxs_2", "lift", "Подъёмник: BLUM Aventos HK-XS (комплект 2 шт)", "pcs", 16000],
  ["lift_hks_2", "lift", "Подъёмник: BLUM Aventos HK-S (комплект 2 шт)", "pcs", 17000],
  ["lift_hktop_2", "lift", "Подъёмник: BLUM Aventos HK-Top (комплект 2 шт)", "pcs", 30000],
  ["lift_hf26_2", "lift", "Подъёмник: BLUM Aventos HF 26 (комплект 2 шт)", "pcs", 48000],
  ["lift_hf29_2", "lift", "Подъёмник: BLUM Aventos HF 29 (комплект 2 шт)", "pcs", 55000],
  ["bottle_150", "accessory", "Корзина-бутылочница (150 мм)", "pcs", 22000],
  ["bottle_300", "accessory", "Корзина-бутылочница (300 мм)", "pcs", 35000],
  ["bottle_400", "accessory", "Корзина-бутылочница (400 мм)", "pcs", 55600],
  ["crab", "accessory", "Крабы для верхних шкафов", "pcs", 2300],
  ["leg", "accessory", "Ножки для нижних шкафов", "pcs", 160],
  ["dryer", "accessory", "Сушка и поддон для приборов", "pcs", 8000],
];

export function buildFurniturePriceItems(
  companyId = MEBELDEMO_ID,
): FurniturePriceItem[] {
  return ROWS.map(([code, category, name, unit, price, sheet], i) => ({
    id: `fp_${companyId}_${code}`,
    companyId,
    code,
    category,
    name,
    unit,
    sheetWidth: sheet?.[0] ?? null,
    sheetHeight: sheet?.[1] ?? null,
    price,
    sortOrder: i + 1,
    active: true,
  }));
}

/** Adds missing price rows for Mebel Demo without touching edited prices. */
export function ensureFurnitureData(data: AppData): boolean {
  if (!data.furniturePriceItems) data.furniturePriceItems = [];
  const existing = new Set(
    data.furniturePriceItems
      .filter((p) => p.companyId === MEBELDEMO_ID)
      .map((p) => p.code),
  );
  const missing = buildFurniturePriceItems().filter(
    (p) => !existing.has(p.code),
  );
  if (missing.length === 0) return false;
  data.furniturePriceItems.push(...missing);
  return true;
}
