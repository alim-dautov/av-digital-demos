import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { addDays, today } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { visiblePriceTypes } from "@/modules/products/service";
import { getQuote } from "@/modules/quotes/service";
import { QuoteEditor } from "../../_components/quote-editor";

export const metadata = { title: "Новое КП" };

export default async function NewQuote({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const u = await requireUser("prices", "full");
  const db = await getDb();
  const types = (await visiblePriceTypes(db, u)).filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }));
  const fromId = Number((await searchParams).from);
  const tpl = fromId ? await getQuote(db, u, fromId).catch(() => null) : null;
  return (
    <>
      <PageHeader back={<BackLink href="/prices?tab=quotes">КП</BackLink>} title={tpl?.isTemplate ? `КП по шаблону «${tpl.templateName}»` : "Новое коммерческое предложение"} />
      <QuoteEditor types={types} initial={{
        id: null, client: null, clientName: "", clientDetails: "", objectName: tpl?.objectName ?? "", priceTypeId: tpl?.priceTypeId ?? types[0]?.id ?? null,
        markupPct: tpl?.markupPct ?? 0, validUntil: addDays(today(), 7), terms: tpl?.terms ?? "", isTemplate: false, templateName: "",
        items: (tpl?.items ?? []).map((i) => ({ key: `t${i.id}`, productId: i.productId, name: i.name, unit: i.unit, qty: Number(i.qty), basePrice: i.basePrice })),
      }} />
    </>
  );
}
