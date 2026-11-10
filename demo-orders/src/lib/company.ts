import type { Company, CompanyVertical } from "@/types";
import { getData } from "@/lib/db";

export const ATELIER_ID = "company_002";
export const MEBELDEMO_ID = "company_001";
export const COMPANY_3_ID = "company_003";

export function getCompany(companyId: string): Company | null {
  return getData().companies.find((c) => c.id === companyId) ?? null;
}

export function getCompanyVertical(companyId: string): CompanyVertical {
  const c = getCompany(companyId);
  if (c?.vertical) return c.vertical;
  if (companyId === ATELIER_ID) return "textiles";
  return "furniture";
}

export function isTextilesCompany(companyId: string): boolean {
  return getCompanyVertical(companyId) === "textiles";
}

/** Company 3 shares furniture nav modules but uses the renovation calculator. */
export function isRenovationCompany(companyId: string): boolean {
  return companyId === COMPANY_3_ID;
}

export function isFurnitureCompany(companyId: string): boolean {
  return getCompanyVertical(companyId) === "furniture" && !isRenovationCompany(companyId);
}

export function isAtelier(companyId: string): boolean {
  return companyId === ATELIER_ID || isTextilesCompany(companyId);
}
