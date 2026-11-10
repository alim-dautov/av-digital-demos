import Link from "next/link";
import { notFound } from "next/navigation";
import { Copy, ExternalLink, FileDown, Pencil } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, NotFoundError } from "@/lib/rbac";
import { fmtDate, money, num } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { DeleteDocButton } from "@/components/delete-doc";
import { SendDocButton } from "@/components/send-doc";
import { DocVersions } from "@/components/doc-versions";
import { getQuote } from "@/modules/quotes/service";
import { deleteQuoteAction } from "@/modules/quotes/actions";
import { getCounterparty } from "@/modules/counterparties/service";

export const metadata = { title: "КП" };

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("prices");
  const db = await getDb();
  const qq = await getQuote(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const cp = qq.counterpartyId ? await getCounterparty(db, u, qq.counterpartyId).catch(() => null) : null;
  const pub = `${process.env.APP_URL ?? ""}/p/quote/${qq.id}.${qq.shareToken}`;
  const full = can(u, "prices", "full");
  const base = (qq.items ?? []).reduce((s, i) => s + Math.round(Number(i.qty) * i.basePrice), 0);
  return (
    <>
      <PageHeader back={<BackLink href={qq.isTemplate ? "/prices?tab=templates" : "/prices?tab=quotes"}>{qq.isTemplate ? "Шаблоны" : "КП"}</BackLink>}
        title={<span className="flex flex-wrap items-center gap-3">{qq.isTemplate ? `Шаблон «${qq.templateName}»` : `КП №${qq.number}`}{qq.validUntil && qq.validUntil < new Date().toISOString().slice(0, 10) && <Badge tone="neutral">истекло</Badge>}</span>}
        subtitle={<>{cp ? <Link href={`/counterparties/${cp.id}`} className="font-semibold text-ink hover:underline">{qq.clientName}</Link> : qq.clientName}{qq.objectName && ` · ${qq.objectName}`} · {fmtDate(qq.createdAt)}</>}
        actions={<>
          <a href={`/api/pdf/quote/${qq.id}`} target="_blank" rel="noreferrer" className={buttonClass("ghost")}><FileDown className="size-4" />Просмотр PDF</a>
          <a href={pub.startsWith("http") ? pub : `/p/quote/${qq.id}.${qq.shareToken}`} target="_blank" rel="noreferrer" className={buttonClass("ghost")}><ExternalLink className="size-4" />Как видит клиент</a>
          {!qq.isTemplate && <SendDocButton entity="quote" id={qq.id} text={`Коммерческое предложение №${qq.number} от Electro Demo на ${money(qq.total)}`} phone={cp?.whatsapp ?? cp?.phone} />}
          {full && <Link href={`/prices/quotes/${qq.id}/edit`} className={buttonClass("secondary")}><Pencil className="size-4" />Изменить</Link>}
          {full && <Link href={`/prices/quotes/new?from=${qq.id}`} className={buttonClass("ghost")}><Copy className="size-4" />Копия</Link>}
          {full && <DeleteDocButton action={deleteQuoteAction} id={qq.id} redirect="/prices?tab=quotes" label={`КП №${qq.number}`} />}
        </>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title={`Позиции · ${qq.lines.length}`} subtitle="так видит клиент" />
          <ul className="divide-y divide-line">
            {qq.lines.map((l, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{l.name}</p><p className="tnum text-xs text-ink-3">{num(l.qty)} {l.unit} × {money(l.price)}{qq.items?.[i] && <span className="ml-2">(база {money(qq.items[i].basePrice)})</span>}</p></div>
                <b className="tnum text-sm">{money(l.sum)}</b>
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex min-w-0 flex-col gap-5 self-start">
        <Card className="flex flex-col gap-2 p-4 text-sm sm:p-5">
          <div className="flex justify-between"><span className="text-ink-3">База</span><span className="tnum">{money(base)}</span></div>
          <div className="flex justify-between"><span className="text-ink-3">Наценка {qq.markupPct}%</span><span className="tnum">{money(qq.total - base)}</span></div>
          <div className="flex justify-between border-t border-line pt-2"><b>Клиенту</b><b className="tnum text-lg">{money(qq.total)}</b></div>
          {qq.validUntil && <p className="text-xs text-ink-3">действительно до {fmtDate(qq.validUntil)}</p>}
          {qq.terms && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface-2 p-3">{qq.terms}</p>}
        </Card>
        {!qq.isTemplate && <DocVersions p={u} entity="quote" id={qq.id} />}
        </div>
      </div>
    </>
  );
}
