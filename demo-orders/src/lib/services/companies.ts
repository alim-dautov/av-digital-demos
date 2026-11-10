import { getData } from "@/lib/db";
import type { Company } from "@/types";

export function listCompanies(): Company[] {
  return getData().companies;
}

export function getCompany(id: string): Company | null {
  return getData().companies.find((c) => c.id === id) ?? null;
}

/** Returns company only if status is active; otherwise null. */
export function getActiveCompany(companyId: string): Company | null {
  const company = getCompany(companyId);
  if (!company || company.status !== "active") return null;
  return company;
}
