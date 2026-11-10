import { redirect } from "next/navigation";
import { PurchasesView } from "./purchases-view";
import { requirePageAccess } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { can } from "@/lib/rbac";
import { listPurchases } from "@/lib/services/purchases";

export default async function PurchasesPage() {
  const session = await requirePageAccess("purchases");
  if (!isTextilesCompany(session.companyId)) redirect("/");
  return (
    <PurchasesView
      purchases={listPurchases(session.companyId)}
      canWrite={can(session, "purchases", "write")}
    />
  );
}
