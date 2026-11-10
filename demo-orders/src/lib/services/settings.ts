import { getData, mutateData } from "@/lib/db";
import type { CompanySettings } from "@/types";

const DEFAULTS: Omit<CompanySettings, "companyId"> = {
  workStart: "09:00",
  workEnd: "18:00",
  workDays: [1, 2, 3, 4, 5, 6],
  lateThresholdMinutes: 0,
  latePenaltyAmount: 20000,
  advanceMaxPercent: 30,
  defaultAssemblerPercent: 15,
  qrRotateSeconds: 60,
};

export function getSettings(companyId: string): CompanySettings {
  const found = getData().settings.find((s) => s.companyId === companyId);
  if (found) return found;
  return { companyId, ...DEFAULTS };
}

export function updateSettings(
  companyId: string,
  patch: Partial<Omit<CompanySettings, "companyId">>,
): CompanySettings {
  let result: CompanySettings = { companyId, ...DEFAULTS };
  mutateData((data) => {
    const idx = data.settings.findIndex((s) => s.companyId === companyId);
    if (idx >= 0) {
      data.settings[idx] = { ...data.settings[idx], ...patch, companyId };
      result = data.settings[idx];
    } else {
      result = { companyId, ...DEFAULTS, ...patch };
      data.settings.push(result);
    }
  });
  return result;
}
