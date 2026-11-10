import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrintButton } from "@/features/proposals/print-button";
import { WorkshopSheet } from "@/features/orders/workshop-sheet";
import { getSession } from "@/lib/auth";
import { isTextilesCompany } from "@/lib/company";
import { getCompany } from "@/lib/services/companies";
import { selectQuoteRooms } from "@/lib/domain/atelier-calc";
import { buildWorkshopDocument } from "@/lib/domain/atelier-workshop";
import { can } from "@/lib/rbac";
import { getOrder } from "@/lib/services/orders";

export default async function WorkshopOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session, "orders", "read")) redirect("/");
  if (!isTextilesCompany(session.companyId)) redirect("/");

  const { id } = await params;
  const order = getOrder(session.companyId, id);
  if (!order?.atelierQuote) notFound();
  if (session.role === "SEAMSTRESS" && !order.sewingOrderAt && !order.proposalId) {
    redirect("/orders");
  }

  const company = getCompany(session.companyId);
  const quote = order.sewingRoomIds?.length
    ? selectQuoteRooms(order.atelierQuote, order.sewingRoomIds)
    : order.atelierQuote;
  const document = buildWorkshopDocument(quote);

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
      <WorkshopSheet
        companyName={company?.name ?? "Шторы Демо"}
        number={order.number}
        clientName={order.client?.fullName ?? order.atelierQuote.clientName}
        document={document}
        deadline={order.deadline}
        orderNote={order.comment}
      />
    </div>
  );
}
