import { requirePageAccess } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getData } from "@/lib/db";
import { getCompany, isRenovationCompany, isTextilesCompany } from "@/lib/company";
import { listClients } from "@/lib/services/clients";
import { getAtelierCatalog } from "@/lib/services/atelier-catalog";
import { listFurniturePrices } from "@/lib/services/furniture-catalog";
import { getAtelierLabels } from "@/lib/services/atelier-labels";
import { getProposal } from "@/lib/services/calculator";
import { normalizeAtelierQuote } from "@/lib/domain/atelier-calc";
import { AtelierCalculator } from "@/features/atelier-calculator/atelier-calculator";
import type { AtelierOrderStatus } from "@/types";
import { FurnitureCalculator } from "@/features/furniture-calculator/furniture-calculator";
import { RenovationCalculator } from "@/features/renovation-calculator/renovation-calculator";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

export default async function CalculatorPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await requirePageAccess("calculator");

  const company = getCompany(session.companyId);
  const clients = listClients(session.companyId).map((c) => ({
    id: c.id,
    fullName: c.fullName,
    phone: c.phone,
    address: c.address ?? null,
    source: c.source,
    sourceNote: c.sourceNote ?? null,
  }));

  const { order: orderParam, proposal: proposalParam } = await searchParams;

  if (isRenovationCompany(session.companyId)) {
    const orderKey = typeof orderParam === "string" ? orderParam : null;
    const order = orderKey
      ? getData().orders.find(
          (o) =>
            o.companyId === session.companyId &&
            isActiveOrder(o) &&
            (o.id === orderKey || o.number === orderKey) &&
            o.renovationQuote,
        )
      : null;
    return (
      <RenovationCalculator
        key={order?.id ?? "new"}
        clients={clients}
        canWrite={can(session, "calculator", "write")}
        companyName={company?.name ?? "Компания 3"}
        initialOrderId={order?.id ?? null}
        initialQuote={order?.renovationQuote ?? null}
      />
    );
  }

  if (isTextilesCompany(session.companyId)) {
    const catalog = getAtelierCatalog(session.companyId);
    const proposal =
      typeof proposalParam === "string"
        ? getProposal(session.companyId, proposalParam)
        : null;
    const atelierOrderKey =
      typeof orderParam === "string" ? orderParam : proposal?.orderId ?? null;
    const atelierOrder = atelierOrderKey
      ? getData().orders.find(
          (o) =>
            o.companyId === session.companyId &&
            isActiveOrder(o) &&
            (o.id === atelierOrderKey || o.number === atelierOrderKey),
        )
      : null;
    const storedQuote = proposal?.quoteSnapshot ?? atelierOrder?.atelierQuote ?? null;
    const initialQuote =
      storedQuote && atelierOrder?.comment && !(storedQuote.orderComment ?? "").trim()
        ? { ...storedQuote, orderComment: atelierOrder.comment }
        : storedQuote;
    // A KP limited to some rooms must not overwrite the full order calculation when saved.
    const orderRoomIds =
      atelierOrder?.atelierQuote ? normalizeAtelierQuote(atelierOrder.atelierQuote).rooms.map((r) => r.id) : [];
    const partialProposal =
      Boolean(proposal?.quoteSnapshot && proposal.roomIds) &&
      orderRoomIds.some((id) => !proposal?.roomIds?.includes(id));
    return (
      <AtelierCalculator
        key={proposal?.id ?? atelierOrder?.id ?? "new"}
        clients={clients}
        catalog={catalog}
        labels={getAtelierLabels(session.companyId)}
        canWrite={can(session, "calculator", "write")}
        companyName={company?.name ?? "Шторы Демо"}
        initialOrderId={partialProposal ? null : (atelierOrder?.id ?? null)}
        initialQuote={initialQuote}
        initialMedia={partialProposal ? [] : (atelierOrder?.media ?? [])}
        sourceProposalNumber={proposal?.quoteSnapshot ? proposal.number : null}
        initialStatus={
          partialProposal ? null : ((atelierOrder?.status as AtelierOrderStatus | undefined) ?? null)
        }
        initialSewingRoomIds={partialProposal ? null : (atelierOrder?.sewingRoomIds ?? null)}
      />
    );
  }

  const orderKey = typeof orderParam === "string" ? orderParam : null;
  const order = orderKey
    ? getData().orders.find(
        (o) =>
          o.companyId === session.companyId &&
          isActiveOrder(o) &&
          (o.id === orderKey || o.number === orderKey) &&
          o.furnitureQuote,
      )
    : null;

  return (
    <FurnitureCalculator
      key={order?.id ?? "new"}
      clients={clients}
      prices={listFurniturePrices(session.companyId)}
      canWrite={can(session, "calculator", "write")}
      companyName={company?.name ?? "Mebel Demo"}
      initialOrderId={order?.id ?? null}
      initialQuote={order?.furnitureQuote ?? null}
    />
  );
}
