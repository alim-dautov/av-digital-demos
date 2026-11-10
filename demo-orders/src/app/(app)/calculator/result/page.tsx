import { AtelierResultClient } from "@/features/atelier-calculator/atelier-result-client";
import { requirePageAccess } from "@/lib/auth";
import { getCompanyLogo } from "@/lib/company-apps";
import { can } from "@/lib/rbac";

export default async function CalculatorResultPage() {
  const session = await requirePageAccess("calculator");
  return (
    <AtelierResultClient
      canWrite={can(session, "calculator", "write")}
      logo={getCompanyLogo(session.companyId)?.full ?? null}
    />
  );
}
