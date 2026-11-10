import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, FileText, Pencil } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag, NotFoundError } from "@/lib/rbac";
import { fmtDate, money, num } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, buttonClass, cn } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { PaymentButton } from "@/components/payment-modal";
import { DeleteDocButton } from "@/components/delete-doc";
import { getReceipt } from "@/modules/receipts/service";
import { deleteReceiptAction } from "@/modules/receipts/actions";
import { visiblePriceTypes } from "@/modules/products/service";
import { ApplyPrices, PostToggle } from "../_components/receipt-tools";

export const metadata = { title: "Приёмка" };

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("receipts");
  const db = await getDb();
  const r = await getReceipt(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const full = can(u, "receipts", "full") && flag(u, "seePurchase");
  const paid = r.payments.reduce((a, x) => a + x.amount, 0);
  const types = (await visiblePriceTypes(db, u)).filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }));
  const changed = r.items.filter((i) => !i.excluded && i.compare && i.compare.delta !== 0).length;
  return (
    <>
      <PageHeader back={<BackLink href="/receipts">Приёмки</BackLink>}
        title={<span className="flex flex-wrap items-center gap-3">Приёмка №{r.number}{!r.posted ? <Badge tone="neutral">черновик</Badge> : r.future ? <Badge tone="info">ожидается</Badge> : <Badge tone="success">проведена</Badge>}</span>}
        subtitle={<><Link href={`/counterparties/${r.supplier.id}`} className="font-semibold text-ink hover:underline">{r.supplier.name}</Link> · {fmtDate(r.date)}{r.supplierDocNumber && ` · накл. ${r.supplierDocNumber}`}</>}
        actions={full && <>
          <PostToggle id={r.id} posted={r.posted} />
          <Link href={`/receipts/${r.id}/edit`} className={buttonClass("secondary")}><Pencil className="size-4" />Изменить</Link>
          {can(u, "products", "full") && <Suspense><ApplyPrices id={r.id} types={types} changedCount={changed} /></Suspense>}
          {r.posted && can(u, "payments", "full") && r.total != null && <PaymentButton direction="out" counterparty={{ id: r.supplier.id, name: r.supplier.name }} receiptId={r.id} amount={Math.max(0, r.total - paid)} label="Оплатить поставщику" />}
          {(!r.posted || flag(u, "deleteDocs")) && <DeleteDocButton action={deleteReceiptAction} id={r.id} redirect="/receipts" label={`приёмку №${r.number}`} />}
        </>} />
      {r.future && r.posted && <p className="mb-4 flex items-center gap-2 rounded-xl bg-info-bg px-4 py-3 text-sm text-info"><CalendarClock className="size-4" />Товар поступит {fmtDate(r.date)} — до этого он виден в «Ожидается» и не входит в остаток</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title={`Позиции · ${r.items.length}`} />
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Товар</th><th className="px-4 py-2.5 text-right">Кол-во</th>{r.total != null && <><th className="px-4 py-2.5 text-right">Цена</th><th className="px-4 py-2.5 text-right">К прошлой</th><th className="px-4 py-2.5 text-right">Сумма</th></>}</tr></thead>
              <tbody>
                {r.items.map((i) => (
                  <tr key={i.id} className={cn("border-b border-line last:border-0", i.excluded && "opacity-50")}>
                    <td className="px-4 py-2.5"><Link href={`/products/${i.productId}`} className="font-semibold hover:underline">{i.name}</Link>{i.excluded && <Badge tone="neutral" className="ml-2">исключена</Badge>}</td>
                    <td className="tnum px-4 py-2.5 text-right whitespace-nowrap">{num(i.qty)} {i.unit}</td>
                    {r.total != null && <>
                      <td className="tnum px-4 py-2.5 text-right">{money(i.price ?? 0)}</td>
                      <td className={cn("tnum px-4 py-2.5 text-right text-xs", i.compare && i.compare.delta > 0 ? "text-danger" : i.compare && i.compare.delta < 0 ? "text-success" : "text-ink-3")} title={i.compare ? `было ${money(i.compare.prevPrice)} · ${i.compare.prevSupplier}, ${fmtDate(i.compare.prevDate)}` : undefined}>
                        {i.compare ? (i.compare.delta === 0 ? "=" : `${i.compare.delta > 0 ? "+" : ""}${i.compare.deltaPct.toFixed(1).replace(".", ",")}%`) : "—"}</td>
                      <td className="tnum px-4 py-2.5 text-right font-semibold">{money(Math.round(i.qty * (i.price ?? 0)))}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="flex flex-col gap-2 self-start p-4 text-sm sm:p-5">
          {r.total != null && <>
            <div className="flex justify-between"><span className="text-ink-3">Сумма</span><b className="tnum text-lg">{money(r.total)}</b></div>
            <div className="flex justify-between"><span className="text-ink-3">Оплачено</span><span className="tnum text-success">{money(paid)}</span></div>
            {r.posted && r.total - paid > 0 && <div className="flex justify-between"><span className="text-ink-3">Долг поставщику</span><b className="tnum text-danger">{money(r.total - paid)}</b></div>}
          </>}
          {r.payments.map((x) => <Link key={x.id} href={`/payments/${x.id}`} className="flex justify-between text-xs text-ink-2 hover:underline"><span>Платёж №{x.number} · {fmtDate(x.date)}</span><span className="tnum">{money(x.amount)}</span></Link>)}
          {r.sourceFile && <a href={`/api/files/${r.sourceFile.id}`} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-2 rounded-xl border border-line px-3 py-2 hover:bg-surface-2"><FileText className="size-4 text-ink-3" /><span className="truncate">{r.sourceFile.name}</span></a>}
          {r.comment && <p className="mt-2 rounded-xl bg-surface-2 p-3">{r.comment}</p>}
        </Card>
      </div>
    </>
  );
}
