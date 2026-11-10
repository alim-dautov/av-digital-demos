import type {
  AppData,
  AtelierAccessoryPrice,
  AtelierAssemblyCoeff,
  AtelierCorniceKind,
  AtelierCornicePrice,
  AtelierCoverPrice,
  AtelierFabric,
  AtelierForgedColor,
  AtelierInstallPrice,
  AtelierPillowPrice,
  AtelierRollerPrice,
} from "@/types";
import { ATELIER_CORNICE_LABELS } from "@/types";
import { ensureGulyaUser } from "./gulya";
import { generateId, nowIso, todayDate, ATELIER_ID } from "@/lib/utils";

const CID = ATELIER_ID;

const STANDARD_CORNICES: { kind: AtelierCorniceKind; sale: number; cost: number }[] = [
  { kind: "ceiling_plastic_1", sale: 2500, cost: 1200 },
  { kind: "ceiling_plastic_2", sale: 3500, cost: 1800 },
  { kind: "ceiling_plastic_3", sale: 4500, cost: 2400 },
  { kind: "aluminum_1", sale: 4500, cost: 2200 },
  { kind: "aluminum_2", sale: 6500, cost: 3200 },
  { kind: "aluminum_3", sale: 8500, cost: 4200 },
  { kind: "simple_1", sale: 3000, cost: 1500 },
  { kind: "simple_2", sale: 4200, cost: 2100 },
  { kind: "simple_3", sale: 5400, cost: 2700 },
];

const FORGED_COLORS: AtelierForgedColor[] = [
  "gold",
  "bronze",
  "white",
  "black",
  "chrome",
  "satin",
];

export function buildAtelierCatalog(companyId = CID): {
  cornices: AtelierCornicePrice[];
  fabrics: AtelierFabric[];
  coeffs: AtelierAssemblyCoeff[];
  covers: AtelierCoverPrice[];
  pillows: AtelierPillowPrice[];
  accessories: AtelierAccessoryPrice[];
  rollers: AtelierRollerPrice[];
  installs: AtelierInstallPrice[];
  materials: AppData["materials"];
} {
  const cornices: AtelierCornicePrice[] = STANDARD_CORNICES.map((c) => ({
    id: `pcn_${c.kind}`,
    companyId,
    kind: c.kind,
    label: ATELIER_CORNICE_LABELS[c.kind],
    forgedColor: null,
    rows: null,
    salePricePerMeter: c.sale,
    costPricePerMeter: c.cost,
    active: true,
  }));

  for (const color of FORGED_COLORS) {
    for (const rows of [1, 2] as const) {
      cornices.push({
        id: `pcn_forged_${color}_${rows}`,
        companyId,
        kind: "forged",
        label: `Кованый ${rows}-рядный`,
        forgedColor: color,
        rows,
        salePricePerMeter: rows === 1 ? 12000 : 16000,
        costPricePerMeter: rows === 1 ? 7000 : 9500,
        active: true,
      });
    }
  }

  const fabricDefs = [
    {
      id: "pfab_port_simple",
      name: "Портьера простая Egger Soft",
      type: "portiere" as const,
      article: "PP-1001",
      sale: 8500,
      cost: 4200,
      stock: 80,
    },
    {
      id: "pfab_port_combo",
      name: "Портьера комбинированная Velvet",
      type: "portiere" as const,
      article: "PP-1002",
      sale: 12500,
      cost: 6800,
      stock: 45,
    },
    {
      id: "pfab_tulle_1",
      name: "Тюль вуаль белая",
      type: "tulle" as const,
      article: "TL-2001",
      sale: 3500,
      cost: 1600,
      stock: 120,
    },
    {
      id: "pfab_tulle_2",
      name: "Тюль органза шампань",
      type: "tulle" as const,
      article: "TL-2002",
      sale: 4800,
      cost: 2200,
      stock: 60,
    },
  ];

  const materials: AppData["materials"] = [];
  const fabrics: AtelierFabric[] = fabricDefs.map((f) => {
    const materialId = `mat_${f.id}`;
    materials.push({
      id: materialId,
      companyId,
      category: f.type === "portiere" ? "fabric_portiere" : "fabric_tulle",
      name: f.name,
      sku: f.article,
      unit: "м.п.",
      quantity: f.stock,
      minStock: 10,
      unitCost: f.cost,
    });
    return {
      id: f.id,
      companyId,
      name: f.name,
      type: f.type,
      article: f.article,
      salePrice: f.sale,
      costPrice: f.cost,
      unit: "м.п.",
      metrage: f.stock,
      stock: f.stock,
      minStock: 10,
      description: "",
      materialId,
      active: true,
    };
  });

  const coeffs: AtelierAssemblyCoeff[] = [1.5, 2, 2.5, 3].map((v, i) => ({
    id: `pcoeff_${i}`,
    companyId,
    value: v,
    label: `×${v}`,
    active: true,
  }));

  const stitches = ["romb", "square", "stripe"] as const;
  const corners = ["sharp", "round"] as const;
  const coverTypes = ["single", "one_bed", "double", "custom"] as const;
  const covers: AtelierCoverPrice[] = [];
  for (const stitch of stitches) {
    for (const corner of corners) {
      for (const coverType of coverTypes) {
        const base =
          coverType === "single"
            ? 25000
            : coverType === "one_bed"
              ? 32000
              : coverType === "double"
                ? 42000
                : 50000;
        covers.push({
          id: `pcov_${stitch}_${corner}_${coverType}`,
          companyId,
          stitch,
          corner,
          coverType,
          salePrice: base,
          costPrice: Math.round(base * 0.55),
          active: true,
        });
      }
    }
  }

  const pillows: AtelierPillowPrice[] = [
    {
      id: "ppil_cover",
      companyId,
      pillowType: "cover",
      salePrice: 4500,
      costPrice: 1800,
      active: true,
    },
    {
      id: "ppil_full",
      companyId,
      pillowType: "full",
      salePrice: 9500,
      costPrice: 4200,
      active: true,
    },
  ];

  const accKinds = [
    { kind: "side_hooks" as const, label: "Боковые крючки", sale: 2500 },
    { kind: "fabric_tiebacks" as const, label: "Подхваты тканевые", sale: 4500 },
    {
      kind: "decorative_tassels" as const,
      label: "Декоративные кисти",
      sale: 6000,
    },
    { kind: "rings" as const, label: "Обхваты", sale: 3500 },
  ];
  const accColors = ["gold", "bronze", "chrome", "white"] as const;
  const accessories: AtelierAccessoryPrice[] = [];
  for (const k of accKinds) {
    for (const color of accColors) {
      accessories.push({
        id: `pacc_${k.kind}_${color}`,
        companyId,
        kind: k.kind,
        label: k.label,
        color,
        salePrice: k.sale,
        costPrice: Math.round(k.sale * 0.45),
        active: true,
      });
    }
  }

  const panels = ["solid", "day_night"] as const;
  const mounts = ["wall", "ceiling", "sash"] as const;
  const mechColors = ["white", "gold_oak", "brown", "grey"] as const;
  const rollers: AtelierRollerPrice[] = [];
  for (const panel of panels) {
    for (const mount of mounts) {
      for (const mechanismColor of mechColors) {
        const sale = panel === "solid" ? 12000 : 16000;
        rollers.push({
          id: `prol_${panel}_${mount}_${mechanismColor}`,
          companyId,
          panel,
          mount,
          mechanismColor,
          salePricePerSqm: sale,
          costPricePerSqm: Math.round(sale * 0.5),
          active: true,
        });
      }
    }
  }

  const installSections = [
    { section: "cornice" as const, label: "Установка карниза", sale: 5000 },
    { section: "curtains" as const, label: "Установка штор", sale: 8000 },
    { section: "covers" as const, label: "Установка покрывал", sale: 3000 },
    { section: "pillows" as const, label: "Установка подушек", sale: 2000 },
    {
      section: "accessories" as const,
      label: "Установка аксессуаров",
      sale: 2500,
    },
    { section: "rollers" as const, label: "Установка ролл-штор", sale: 7000 },
  ];
  const installs: AtelierInstallPrice[] = installSections.map((s) => ({
    id: `pinst_${s.section}`,
    companyId,
    section: s.section,
    label: s.label,
    salePrice: s.sale,
    costPrice: Math.round(s.sale * 0.4),
    active: true,
  }));

  return {
    cornices,
    fabrics,
    coeffs,
    covers,
    pillows,
    accessories,
    rollers,
    installs,
    materials,
  };
}

function buildAtelierSettings(): AppData["settings"][0] {
  return {
    companyId: CID,
    workStart: "09:00",
    workEnd: "18:00",
    workDays: [1, 2, 3, 4, 5],
    lateThresholdMinutes: 10,
    latePenaltyAmount: 2000,
    advanceMaxPercent: 30,
    defaultAssemblerPercent: 0,
    qrRotateSeconds: 60,
  };
}

/** Merge ZP data into existing AppData if not yet present */
export function ensureAtelierData(data: AppData): boolean {
  let changed = false;

  for (const c of data.companies) {
    if (!("vertical" in c) || !(c as { vertical?: string }).vertical) {
      (c as { vertical: string }).vertical =
        c.id === CID ? "textiles" : "furniture";
      changed = true;
    }
  }

  const c2 = data.companies.find((c) => c.id === CID);
  if (c2) {
    if (c2.name !== "Шторы Демо" || c2.status !== "active") {
      c2.name = "Шторы Демо";
      c2.tagline = "шторы и текстиль";
      c2.status = "active";
      c2.vertical = "textiles";
      c2.phone = "+7 (727) 111-22-33";
      c2.email = "hello@example.com";
      c2.address = "Алматы";
      changed = true;
    }
  }

  if (!data.atelierCornicePrices) {
    data.atelierCornicePrices = [];
    changed = true;
  }
  if (!data.atelierFabrics) {
    data.atelierFabrics = [];
    changed = true;
  }
  if (!data.atelierAssemblyCoeffs) {
    data.atelierAssemblyCoeffs = [];
    changed = true;
  }
  if (!data.atelierCoverPrices) {
    data.atelierCoverPrices = [];
    changed = true;
  }
  if (!data.atelierPillowPrices) {
    data.atelierPillowPrices = [];
    changed = true;
  }
  if (!data.atelierAccessoryPrices) {
    data.atelierAccessoryPrices = [];
    changed = true;
  }
  if (!data.atelierRollerPrices) {
    data.atelierRollerPrices = [];
    changed = true;
  }
  if (!data.atelierInstallPrices) {
    data.atelierInstallPrices = [];
    changed = true;
  }

  const hasCatalog = data.atelierCornicePrices.some(
    (p) => p.companyId === CID,
  );
  if (!hasCatalog) {
    const cat = buildAtelierCatalog(CID);
    data.atelierCornicePrices.push(...cat.cornices);
    data.atelierFabrics.push(...cat.fabrics);
    data.atelierAssemblyCoeffs.push(...cat.coeffs);
    data.atelierCoverPrices.push(...cat.covers);
    data.atelierPillowPrices.push(...cat.pillows);
    data.atelierAccessoryPrices.push(...cat.accessories);
    data.atelierRollerPrices.push(...cat.rollers);
    data.atelierInstallPrices.push(...cat.installs);
    for (const m of cat.materials) {
      if (!data.materials.some((x) => x.id === m.id)) data.materials.push(m);
    }
    changed = true;
  }

  if (!data.settings.some((s) => s.companyId === CID)) {
    data.settings.push(buildAtelierSettings());
    changed = true;
  }

  for (const client of data.clients) {
    if (!client.photos) {
      client.photos = [];
      changed = true;
    }
    if (!client.notes) {
      client.notes = [];
      changed = true;
    }
  }

  if (!data.atelierServicePrices) data.atelierServicePrices = [];
  if (!data.atelierServicePrices.some((p) => p.companyId === CID)) {
    data.atelierServicePrices.push({
      companyId: CID,
      sewingSalePerMeter: 1500,
      sewingCostPerMeter: 600,
      tapeSalePerMeter: 400,
      tapeCostPerMeter: 150,
    });
    changed = true;
  }
  if (!data.atelierLabels) {
    data.atelierLabels = [];
    changed = true;
  }
  if (!data.measurements) {
    data.measurements = [];
    changed = true;
  }
  if (!data.galleryPhotos) {
    data.galleryPhotos = [];
    changed = true;
  }
  if (!data.galleryFolders) data.galleryFolders = [];
  if (!data.galleryFolders.some((f) => f.companyId === CID)) {
    const now = nowIso();
    for (const name of ["Шторы", "Карнизы", "Покрывала", "Подушки", "Тюли"]) {
      data.galleryFolders.push({
        id: generateId("gfold"),
        companyId: CID,
        name,
        system: true,
        createdAt: now,
      });
    }
    changed = true;
  }

  const zpEmployees = data.employees.filter((e) => e.companyId === CID);
  if (zpEmployees.length && !zpEmployees.some((e) => e.isMeasurer !== undefined)) {
    for (const e of zpEmployees) e.isMeasurer = e.id === "emp_zp_manager";
    changed = true;
  }

  if (!data.cashEntries) {
    data.cashEntries = [];
    changed = true;
  }
  if (!data.purchases) {
    data.purchases = [];
    changed = true;
  }
  if (ensureGulyaUser(data)) changed = true;

  return changed;
}

export function appendAtelierToSeed(data: AppData): void {
  const mebeldemo = data.companies.find((c) => c.id !== CID && c.name === "Mebel Demo");
  if (mebeldemo) {
    mebeldemo.vertical = "furniture";
  }

  for (const c of data.companies) {
    if (c.id === CID) {
      c.name = "Шторы Демо";
      c.tagline = "шторы и текстиль";
      c.status = "active";
      c.vertical = "textiles";
      c.phone = "+7 (727) 111-22-33";
      c.email = "hello@example.com";
      c.address = "Алматы";
    } else if (!c.vertical) {
      c.vertical = "furniture";
    }
  }

  const cat = buildAtelierCatalog(CID);
  data.atelierCornicePrices = cat.cornices;
  data.atelierFabrics = cat.fabrics;
  data.atelierAssemblyCoeffs = cat.coeffs;
  data.atelierCoverPrices = cat.covers;
  data.atelierPillowPrices = cat.pillows;
  data.atelierAccessoryPrices = cat.accessories;
  data.atelierRollerPrices = cat.rollers;
  data.atelierInstallPrices = cat.installs;
  data.materials.push(...cat.materials);

  data.settings.push(buildAtelierSettings());
}
