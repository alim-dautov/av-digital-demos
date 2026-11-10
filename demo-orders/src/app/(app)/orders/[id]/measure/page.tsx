import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MeasurementSheet } from "@/features/atelier-calculator/measurement-sheet";
import { PrintButton } from "@/features/proposals/print-button";
import { getSession } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { getCompanyLogo } from "@/lib/company-apps";
import { buildAtelierProposalDocument } from "@/lib/domain/atelier-calc";
import { can } from "@/lib/rbac";
import { getCompany } from "@/lib/services/companies";
import { getOrder } from "@/lib/services/orders";

export default async function OrderMeasurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, "calculator", "read") && !can(session, "orders", "read")) {
    redirect("/");
  }
  if (session.role === "SEAMSTRESS") redirect("/orders");
  if (!isTextilesCompany(session.companyId)) redirect("/");

  const { id } = await params;
  const order = getOrder(session.companyId, id);
  if (!order?.atelierQuote) notFound();
  const company = getCompany(session.companyId);
  const document = buildAtelierProposalDocument(order.atelierQuote);

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href={`/orders/${order.number}`}>
            <ArrowLeft className="size-4" />
            К заказу
          </Link>
        </Button>
        <PrintButton />
      </div>
      <MeasurementSheet
        companyName={company?.name ?? "Шторы Демо"}
        companyTagline={company?.tagline}
        logo={getCompanyLogo(session.companyId)?.full ?? null}
        companyPhone={company?.phone}
        number={order.number}
        createdAt={order.createdAt}
        clientName={order.client?.fullName ?? order.atelierQuote.clientName}
        clientPhone={order.client?.phone ?? order.atelierQuote.clientPhone}
        address={order.address || order.atelierQuote.address}
        deadline={order.deadline}
        document={document}
        comment={order.comment || order.atelierQuote.orderComment}
        photos={order.media.filter((item) => item.type === "photo")}
      />
    </div>
  );
}
