import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { getCounterparty, salesManagers } from "@/modules/counterparties/service";
import { visiblePriceTypes } from "@/modules/products/service";
import { defaultPriceType } from "@/modules/orders/service";
import { OrderEditor } from "../_components/order-editor";

export const metadata = { title: "Новая заявка" };

export default async function NewOrder({ searchParams }: { searchParams: Promise<{ cp?: string }> }) {
  const u = await requireUser("orders", "full");
  const { cp } = await searchParams;
  const db = await getDb();
  const [types, managers] = await Promise.all([visiblePriceTypes(db, u), salesManagers(db)]);
  const c = cp && Number(cp) ? await getCounterparty(db, u, Number(cp)).catch(() => null) : null;
  return (
    <>
      <PageHeader back={<BackLink href="/orders">Заявки</BackLink>} title="Новая заявка" />
      <OrderEditor priceTypes={types.filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }))} managers={managers}
        initial={{
          counterparty: c ? { id: c.id, name: c.name, phone: c.phone, segment: c.segment, isService: c.isService, clientDebt: c.clientDebt, managerId: c.managerId } : null,
          priceTypeId: c ? await defaultPriceType(db, c.id) : null, managerId: c?.managerId ?? (u.isSalesManager ? u.id : null),
          deliveryDate: "", discountPct: 0, comment: "", items: [],
        }} />
    </>
  );
}
