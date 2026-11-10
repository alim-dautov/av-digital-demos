import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { visiblePriceTypes } from "@/modules/products/service";
import { getQuote } from "@/modules/quotes/service";
import { getCounterparty } from "@/modules/counterparties/service";
import { QuoteEditor } from "../../../_components/quote-editor";

export const metadata = { title: "Изменение КП" };

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("prices", "full");
  const db = await getDb();
  const qq = await getQuote(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const cp = qq.counterpartyId ? await getCounterparty(db, u, qq.counterpartyId).catch(() => null) : null;
  const types = (await visiblePriceTypes(db, u)).filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }));
  return (
    <>
      <PageHeader back={<BackLink href={`/prices/quotes/${qq.id}`}>КП №{qq.number}</BackLink>} title={`КП №${qq.number}`} subtitle="редактирование" />
      <QuoteEditor types={types} initial={{
        id: qq.id, client: cp ? { id: cp.id, name: cp.name, phone: cp.phone, segment: cp.segment, isService: cp.isService, clientDebt: cp.clientDebt, managerId: cp.managerId } : null,
        clientName: qq.clientName, clientDetails: qq.clientDetails, objectName: qq.objectName, priceTypeId: qq.priceTypeId, markupPct: qq.markupPct ?? 0,
        validUntil: qq.validUntil ?? "", terms: qq.terms, isTemplate: qq.isTemplate, templateName: qq.templateName ?? "",
        items: (qq.items ?? []).map((i) => ({ key: `e${i.id}`, productId: i.productId, name: i.name, unit: i.unit, qty: Number(i.qty), basePrice: i.basePrice })),
      }} />
    </>
  );
}
