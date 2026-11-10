import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceEditor } from "./invoice-editor";
import { requirePageAccess } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { getCompany } from "@/lib/services/companies";
import { can } from "@/lib/rbac";
import { getPurchase } from "@/lib/services/purchases";

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageAccess("purchases");
  if (!isTextilesCompany(session.companyId)) redirect("/");
  const { id } = await params;
  const purchase = getPurchase(session.companyId, id);
  if (!purchase) notFound();
  const company = getCompany(session.companyId);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="no-print -ml-2">
        <Link href="/purchases">
          <ArrowLeft className="size-4" />
          К закупу
        </Link>
      </Button>
      <InvoiceEditor
        purchase={purchase}
        companyName={company?.name ?? "Шторы Демо"}
        canWrite={can(session, "purchases", "write")}
      />
    </div>
  );
}
