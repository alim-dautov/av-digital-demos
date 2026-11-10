import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { q } from "@/db/sql";
import { requireUser } from "@/lib/auth";
import { flag } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { draftFromOrder } from "@/modules/shipments/service";
import { getCounterparty } from "@/modules/counterparties/service";
import { stockSql } from "@/modules/stock/queries";
import { ShipmentEditor } from "../_components/shipment-editor";

export const metadata = { title: "Новая отгрузка" };

export default async function NewShipment({ searchParams }: { searchParams: Promise<{ order?: string; kind?: string; cp?: string }> }) {
  const u = await requireUser("shipments", "full");
  const sp = await searchParams;
  const db = await getDb();
  const kind = sp.kind === "return" ? "return" : "shipment";
  const orderId = sp.order ? Number(sp.order) : null;
  let lines: { productId: number; name: string; unit: string; qty: number; price: number; max?: number; ordered?: number; shipped?: number; stock?: number }[] = [];
  let cpId = sp.cp ? Number(sp.cp) : null;
  let orderNumber: number | undefined;
  let priceTypeId: number | null = null;
  if (orderId) {
    const d = await draftFromOrder(db, u, orderId);
    const [o] = await q<{ number: number; price_type_id: number | null }>(db, sql`select number, price_type_id from orders where id = ${orderId}`);
    orderNumber = o?.number;
    priceTypeId = o?.price_type_id ?? null;
    cpId = d.counterpartyId;
    const stock = await q<{ product_id: number; qty: number }>(db, sql`select product_id, qty::float8 qty from ${stockSql()} s`);
    const sm = new Map(stock.map((s) => [s.product_id, Number(s.qty)]));
    lines = kind === "return"
      ? d.items.filter((i) => i.shipped > 0).map((i) => ({ ...i, qty: 0, max: i.shipped }))
      : d.items.filter((i) => i.qty > 0).map((i) => ({ ...i, stock: sm.get(i.productId) ?? 0 }));
  }
  const cp = cpId ? await getCounterparty(db, u, cpId).catch(() => null) : null;
  return (
    <>
      <PageHeader back={<BackLink href={orderId ? `/orders/${orderId}` : "/shipments"}>{orderId ? `Заявка №${orderNumber}` : "Отгрузки"}</BackLink>} title={kind === "return" ? "Возврат" : "Новая отгрузка"} />
      <ShipmentEditor kind={kind} orderId={orderId} orderNumber={orderNumber} priceTypeId={priceTypeId} canOverride={u.isOwner || flag(u, "deleteDocs")} lines={lines}
        counterparty={cp ? { id: cp.id, name: cp.name, phone: cp.phone, segment: cp.segment, isService: cp.isService, clientDebt: cp.clientDebt, managerId: cp.managerId } : null} />
    </>
  );
}
