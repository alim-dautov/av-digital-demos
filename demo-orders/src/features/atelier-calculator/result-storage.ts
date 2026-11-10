import type { AtelierQuoteSnapshot } from "@/types";

export const ATELIER_RESULT_KEY = "atelier-calc-result";

export type AtelierCalcResult = {
  quote: AtelierQuoteSnapshot;
  companyName: string;
  measurementId?: string | null;
};

export function readCalcResult(): AtelierCalcResult | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ATELIER_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AtelierCalcResult;
    if (!parsed?.quote) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCalcResult(result: AtelierCalcResult) {
  sessionStorage.setItem(ATELIER_RESULT_KEY, JSON.stringify(result));
}
