import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { NotFoundError } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { balanceOf, salesManagers } from "@/modules/counterparties/service";
import { pricesFor, visiblePriceTypes } from "@/modules/products/service";
import { getOrder } from "@/modules/orders/service";
import { OrderEditor } from "../../_components/order-editor";

export const metadata = { title: "Редактирование заявки" };

export default async function EditOrder({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("orders", "full");
  const db = await getDb();
  const o = await getOrder(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const [types, managers, prices, bal] = await Promise.all([visiblePriceTypes(db, u), salesManagers(db), pricesFor(db, u, o.items.map((i) => i.productId)), balanceOf(db, o.counterpartyId)]);
  return (
    <>
      <PageHeader back={<BackLink href={`/orders/${o.id}`}>Заявка №{o.number}</BackLink>} title={`Заявка №${o.number}`} subtitle="редактирование" />
      <OrderEditor priceTypes={types.filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }))} managers={managers}
        initial={{
          id: o.id, number: o.number,
          counterparty: { id: o.counterparty.id, name: o.counterparty.name, phone: o.counterparty.phone, segment: o.counterparty.segment, isService: o.counterparty.isService, clientDebt: bal.clientDebt, managerId: o.counterparty.managerId },
          priceTypeId: o.priceTypeId, managerId: o.managerId, coUserId: o.coUserId, deliveryDate: o.deliveryDate ?? "", discountPct: o.discountPct, comment: o.comment,
          items: o.items.map((i) => ({ key: `i${i.id}`, productId: i.productId, name: i.name, unit: i.unit, stock: i.stock, qty: i.qty, price: i.price, prices: Object.fromEntries(Object.entries(prices.get(i.productId) ?? {})) })),
        }} />
    </>
  );
}
