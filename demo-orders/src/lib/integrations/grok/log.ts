import { getData, mutateDataLocked } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type { GrokLogEntry } from "@/types";
import { grokSettingsInData } from "./settings";

const MAX_PER_COMPANY = 200;

export type GrokLogInput = Omit<GrokLogEntry, "id" | "at">;

export function recordGrokLog(input: GrokLogInput): GrokLogEntry {
  const entry: GrokLogEntry = {
    id: generateId("grk"),
    at: nowIso(),
    ...input,
    message: input.message.slice(0, 500),
  };
  mutateDataLocked((data) => {
    data.grokLogs.unshift(entry);
    let kept = 0;
    data.grokLogs = data.grokLogs.filter((l) => {
      if (l.companyId !== entry.companyId) return true;
      kept += 1;
      return kept <= MAX_PER_COMPANY;
    });
    if (!entry.companyId) return;
    const settings = grokSettingsInData(data, entry.companyId);
    if (entry.outcome === "error") {
      settings.lastErrorAt = entry.at;
      settings.lastError = entry.message;
    } else if (entry.outcome !== "denied") {
      settings.lastSuccessAt = entry.at;
    }
  });
  return entry;
}

/** Company entries plus failures that happened before the company was known. */
export function listGrokLogs(companyId: string, opts?: { errorsOnly?: boolean; limit?: number }) {
  return getData()
    .grokLogs.filter(
      (l) =>
        (l.companyId === companyId || l.companyId === null) &&
        (!opts?.errorsOnly || l.outcome === "error" || l.outcome === "denied"),
    )
    .slice(0, opts?.limit ?? 50);
}
