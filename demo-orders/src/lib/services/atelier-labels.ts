import { getData, mutateData } from "@/lib/db";
import { nowIso } from "@/lib/utils";
import { resolveAtelierLabels } from "@/lib/domain/atelier-labels";
import type { AtelierLabels, AtelierServicePrices } from "@/types";

export function getAtelierLabels(companyId: string): AtelierLabels {
  const record = getData().atelierLabels.find((l) => l.companyId === companyId);
  return resolveAtelierLabels(record?.labels);
}

export function updateAtelierLabels(
  companyId: string,
  patch: Partial<AtelierLabels>,
): AtelierLabels {
  let result!: AtelierLabels;
  mutateData((data) => {
    const idx = data.atelierLabels.findIndex((l) => l.companyId === companyId);
    const prev = idx >= 0 ? data.atelierLabels[idx].labels : undefined;
    result = resolveAtelierLabels({ ...prev, ...patch });
    const record = { companyId, labels: result, updatedAt: nowIso() };
    if (idx >= 0) data.atelierLabels[idx] = record;
    else data.atelierLabels.push(record);
  });
  return result;
}

const DEFAULT_SERVICE_PRICES: Omit<AtelierServicePrices, "companyId"> = {
  sewingSalePerMeter: 0,
  sewingCostPerMeter: 0,
  tapeSalePerMeter: 0,
  tapeCostPerMeter: 0,
};

export function getAtelierServicePrices(companyId: string): AtelierServicePrices {
  return (
    getData().atelierServicePrices.find((p) => p.companyId === companyId) ?? {
      companyId,
      ...DEFAULT_SERVICE_PRICES,
    }
  );
}

export function updateAtelierServicePrices(
  companyId: string,
  patch: Partial<Omit<AtelierServicePrices, "companyId">>,
): AtelierServicePrices {
  let result!: AtelierServicePrices;
  mutateData((data) => {
    const idx = data.atelierServicePrices.findIndex((p) => p.companyId === companyId);
    const prev = idx >= 0 ? data.atelierServicePrices[idx] : { companyId, ...DEFAULT_SERVICE_PRICES };
    result = { ...prev, ...patch, companyId };
    if (idx >= 0) data.atelierServicePrices[idx] = result;
    else data.atelierServicePrices.push(result);
  });
  return result;
}
