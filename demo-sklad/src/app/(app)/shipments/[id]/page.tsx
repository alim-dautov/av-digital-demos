import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Undo2 } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag, NotFoundError } from "@/lib/rbac";
import { fmtDate, money, num, pct } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { PaymentButton } from "@/components/payment-modal";
import { DeleteDocButton } from "@/components/delete-doc";
import { getShipment } from "@/modules/shipments/service";
import { deleteShipmentAction } from "@/modules/shipments/actions";
import { SendDocButton } from "@/components/send-doc";
import { DocVersions } from "@/components/doc-versions";

export const metadata = { title: "Отгрузка" };

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("shipments");
  const db = await getDb();
  const s = await getShipment(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const isReturn = s.kind === "return";
  const paid = s.payments.reduce((a, x) => a + x.amount, 0);
  return (
    <>
      <PageHeader back={<BackLink href="/shipments">Отгрузки</BackLink>}
        title={<span className="flex flex-wrap items-center gap-3">{isReturn ? "Возврат" : "Отгрузка"} №{s.number}{isReturn ? <Badge tone="warning">возврат</Badge> : <Badge tone="success">проведена</Badge>}</span>}
        subtitle={<><Link href={`/counterparties/${s.counterparty.id}`} className="font-semibold text-ink hover:underline">{s.counterparty.name}</Link> · {fmtDate(s.date)}{s.order && <> · <Link href={`/orders/${s.order.id}`} className="hover:underline">заявка №{s.order.number}</Link></>}</>}
        actions={<>
          <a href={`/api/pdf/shipment/${s.id}`} target="_blank" rel="noreferrer" className={buttonClass("ghost")}><FileDown className="size-4" />Просмотр PDF</a>
          <SendDocButton entity="shipment" id={s.id} text={`${isReturn ? "Возврат" : "Накладная"} №${s.number} от Electro Demo на ${money(s.total)}`} phone={s.counterparty.whatsapp ?? s.counterparty.phone} />
          {!isReturn && s.order && can(u, "shipments", "full") && <Link href={`/shipments/new?order=${s.order.id}&kind=return`} className={buttonClass("secondary")}><Undo2 className="size-4" />Возврат</Link>}
          {!isReturn && can(u, "payments", "full") && <PaymentButton direction="in" counterparty={{ id: s.counterparty.id, name: s.counterparty.name }} orderId={s.order?.id} shipmentId={s.order ? undefined : s.id} amount={Math.max(0, s.total - paid)} />}
          {can(u, "shipments", "full") && flag(u, "deleteDocs") && <DeleteDocButton action={deleteShipmentAction} id={s.id} redirect="/shipments" label={`${isReturn ? "возврат" : "отгрузку"} №${s.number}`} />}
        </>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title={`Позиции · ${s.items.length}`} />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Товар</th><th className="px-4 py-2.5 text-right">Кол-во</th><th className="px-4 py-2.5 text-right">Цена</th>{s.cost != null && <th className="px-4 py-2.5 text-right">Себест.</th>}<th className="px-4 py-2.5 text-right">Сумма</th></tr></thead>
              <tbody>
                {s.items.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5"><Link href={`/products/${i.productId}`} className="font-semibold hover:underline">{i.name}</Link></td>
                    <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">{num(i.qty)} {i.unit}</td>
                    <td className="tnum px-4 py-2.5 text-right">{money(i.price)}</td>
                    {s.cost != null && <td className="tnum px-4 py-2.5 text-right text-ink-2">{money(i.cost)}{i.costEstimated && <span title="Расчётная: нет приёмки, взята закупка из карточки" className="ml-1 text-warning">*</span>}</td>}
                    <td className="tnum px-4 py-2.5 text-right font-semibold">{money(Math.round(i.qty * i.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {s.items.some((i) => i.costEstimated) && <p className="border-t border-line px-4 py-2 text-xs text-ink-3">* расчётная себестоимость — закупка из карточки товара (приёмок не было)</p>}
        </Card>
        <div className="flex min-w-0 flex-col gap-5 self-start">
        <Card className="flex flex-col gap-2 p-4 text-sm sm:p-5">
          <div className="flex justify-between"><span className="text-ink-3">Сумма</span><b className="tnum text-lg">{money(s.total)}</b></div>
          {s.cost != null && s.margin != null && <>
            <div className="flex justify-between"><span className="text-ink-3">Себестоимость</span><span className="tnum">{money(s.cost)}</span></div>
            <div className="flex justify-between"><span className="text-ink-3">Маржа</span><b className={`tnum ${s.margin < 0 ? "text-danger" : "text-success"}`}>{money(s.margin)} · {s.total ? pct((s.margin / s.total) * 100) : "—"}</b></div>
          </>}
          {!isReturn && <div className="flex justify-between"><span className="text-ink-3">Оплачено</span><span className="tnum text-success">{money(paid)}</span></div>}
          {s.comment && <p className="mt-2 rounded-xl bg-surface-2 p-3">{s.comment}</p>}
        </Card>
        <DocVersions p={u} entity="shipment" id={s.id} />
        </div>
      </div>
    </>
  );
}
