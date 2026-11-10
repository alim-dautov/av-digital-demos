import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag, NotFoundError } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { PAY_METHODS } from "@/lib/labels";
import { Badge, Card, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { DeleteDocButton } from "@/components/delete-doc";
import { getPayment } from "@/modules/finance/service";
import { deletePaymentAction } from "@/modules/finance/actions";

export const metadata = { title: "Платёж" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("payments");
  const db = await getDb();
  const pm = await getPayment(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const row = (k: string, v: React.ReactNode) => <div className="flex justify-between gap-4 border-b border-line py-3 last:border-0"><span className="text-ink-3">{k}</span><span className="text-right font-medium">{v}</span></div>;
  return (
    <>
      <PageHeader back={<BackLink href="/payments">Платежи</BackLink>}
        title={<span className="flex items-center gap-3">Платёж №{pm.number}{pm.deletedAt ? <Badge tone="danger">удалён</Badge> : pm.direction === "in" ? <Badge tone="success">поступление</Badge> : <Badge tone="neutral">выплата</Badge>}</span>}
        actions={!pm.deletedAt && can(u, "payments", "full") && flag(u, "deleteDocs") && <DeleteDocButton action={deletePaymentAction} id={pm.id} redirect="/payments" label={`платёж №${pm.number}`} />} />
      <Card className="max-w-xl px-4 text-sm sm:px-5">
        {row("Сумма", <b className="tnum text-lg">{money(pm.amount)}</b>)}
        {row("Контрагент", <Link href={`/counterparties/${pm.counterparty.id}`} className="hover:underline">{pm.counterparty.name}</Link>)}
        {row("Дата", fmtDate(pm.date))}
        {row("Способ", PAY_METHODS[pm.method as keyof typeof PAY_METHODS] ?? pm.method)}
        {pm.account && row("Касса / счёт", pm.account.name)}
        {pm.order && row("Заявка", <Link href={`/orders/${pm.order.id}`} className="hover:underline">№{pm.order.number}</Link>)}
        {pm.receiptId && row("Приёмка", <Link href={`/receipts/${pm.receiptId}`} className="hover:underline">открыть</Link>)}
        {pm.comment && row("Комментарий", pm.comment)}
        {row("Создан", fmtDate(pm.createdAt, true))}
      </Card>
    </>
  );
}
