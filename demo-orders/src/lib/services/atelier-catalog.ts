import { getData, mutateData } from "@/lib/db";
import type {
  AtelierAccessoryPrice,
  AtelierAssemblyCoeff,
  AtelierCornicePrice,
  AtelierCoverPrice,
  AtelierFabric,
  AtelierInstallPrice,
  AtelierPillowPrice,
  AtelierRollerPrice,
} from "@/types";
import { generateId, nowIso } from "@/lib/utils";
import { getAtelierServicePrices } from "@/lib/services/atelier-labels";

export function getAtelierCatalog(companyId: string) {
  const data = getData();
  return {
    cornices: data.atelierCornicePrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    fabrics: data.atelierFabrics.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    coeffs: data.atelierAssemblyCoeffs.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    covers: data.atelierCoverPrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    pillows: data.atelierPillowPrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    accessories: data.atelierAccessoryPrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    rollers: data.atelierRollerPrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    installs: data.atelierInstallPrices.filter(
      (p) => p.companyId === companyId && p.active,
    ),
    servicePrices: getAtelierServicePrices(companyId),
  };
}

export function listAtelierFabrics(companyId: string, all = false) {
  return getData().atelierFabrics.filter(
    (f) => f.companyId === companyId && (all || f.active),
  );
}

export function upsertAtelierFabric(
  companyId: string,
  input: Partial<AtelierFabric> & {
    name: string;
    type: "portiere" | "tulle";
    article: string;
    salePrice: number;
    costPrice: number;
  },
): AtelierFabric {
  let result!: AtelierFabric;
  mutateData((data) => {
    if (input.id) {
      const idx = data.atelierFabrics.findIndex(
        (f) => f.id === input.id && f.companyId === companyId,
      );
      if (idx >= 0) {
        const prev = data.atelierFabrics[idx];
        const next: AtelierFabric = {
          ...prev,
          ...input,
          companyId,
          unit: input.unit ?? prev.unit ?? "м.п.",
          metrage: input.metrage ?? prev.metrage,
          stock: input.stock ?? prev.stock,
          minStock: input.minStock ?? prev.minStock,
          description: input.description ?? prev.description,
          materialId: prev.materialId,
          active: input.active ?? prev.active,
        };
        data.atelierFabrics[idx] = next;
        if (next.materialId) {
          const mat = data.materials.find(
            (m) => m.id === next.materialId && m.companyId === companyId,
          );
          if (mat) {
            mat.name = next.name;
            mat.sku = next.article;
            mat.unitCost = next.costPrice;
            mat.minStock = next.minStock;
            mat.category =
              next.type === "portiere" ? "fabric_portiere" : "fabric_tulle";
          }
        }
        result = next;
        return;
      }
    }

    const materialId = generateId("mat");
    const fabric: AtelierFabric = {
      id: generateId("pfab"),
      companyId,
      name: input.name,
      type: input.type,
      article: input.article,
      salePrice: input.salePrice,
      costPrice: input.costPrice,
      unit: input.unit ?? "м.п.",
      metrage: input.metrage ?? input.stock ?? 0,
      stock: input.stock ?? 0,
      minStock: input.minStock ?? 10,
      description: input.description ?? "",
      materialId,
      active: true,
    };
    data.atelierFabrics.push(fabric);
    data.materials.push({
      id: materialId,
      companyId,
      category:
        fabric.type === "portiere" ? "fabric_portiere" : "fabric_tulle",
      name: fabric.name,
      sku: fabric.article,
      unit: fabric.unit,
      quantity: fabric.stock,
      minStock: fabric.minStock,
      unitCost: fabric.costPrice,
    });
    result = fabric;
  });
  return result;
}

export function updateCatalogPrices(
  companyId: string,
  patch: {
    cornices?: AtelierCornicePrice[];
    coeffs?: AtelierAssemblyCoeff[];
    covers?: AtelierCoverPrice[];
    pillows?: AtelierPillowPrice[];
    accessories?: AtelierAccessoryPrice[];
    rollers?: AtelierRollerPrice[];
    installs?: AtelierInstallPrice[];
  },
) {
  mutateData((data) => {
    if (patch.cornices) {
      for (const row of patch.cornices) {
        const i = data.atelierCornicePrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierCornicePrices[i] = { ...row, companyId };
      }
    }
    if (patch.coeffs) {
      for (const row of patch.coeffs) {
        const i = data.atelierAssemblyCoeffs.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierAssemblyCoeffs[i] = { ...row, companyId };
      }
    }
    if (patch.covers) {
      for (const row of patch.covers) {
        const i = data.atelierCoverPrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierCoverPrices[i] = { ...row, companyId };
      }
    }
    if (patch.pillows) {
      for (const row of patch.pillows) {
        const i = data.atelierPillowPrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierPillowPrices[i] = { ...row, companyId };
      }
    }
    if (patch.accessories) {
      for (const row of patch.accessories) {
        const i = data.atelierAccessoryPrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierAccessoryPrices[i] = { ...row, companyId };
      }
    }
    if (patch.rollers) {
      for (const row of patch.rollers) {
        const i = data.atelierRollerPrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierRollerPrices[i] = { ...row, companyId };
      }
    }
    if (patch.installs) {
      for (const row of patch.installs) {
        const i = data.atelierInstallPrices.findIndex(
          (p) => p.id === row.id && p.companyId === companyId,
        );
        if (i >= 0) data.atelierInstallPrices[i] = { ...row, companyId };
      }
    }
  });
  return getAtelierCatalog(companyId);
}

export function syncFabricStockFromMaterial(companyId: string) {
  mutateData((data) => {
    for (const f of data.atelierFabrics) {
      if (f.companyId !== companyId || !f.materialId) continue;
      const mat = data.materials.find((m) => m.id === f.materialId);
      if (mat) {
        f.stock = mat.quantity;
        f.metrage = mat.quantity;
      }
    }
  });
}

export { nowIso };
