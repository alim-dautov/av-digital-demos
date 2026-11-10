import { FileDown, Phone } from "lucide-react";
import { getDb } from "@/db";
import { fmtDate, money, num } from "@/lib/format";
import { moneyInWords } from "@/lib/words";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import { getQuote } from "@/modules/quotes/service";

export const metadata = { title: "Коммерческое предложение" };

/** token = `${id}.${shareToken}` — без входа; базовые цены и наценка не раскрываются */
export default async function PublicQuote({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [idStr, share] = decodeURIComponent(token).split(".");
  const db = await getDb();
  const qq = await getQuote(db, null, Number(idStr), share).catch(() => null);
  if (!qq) return <Card className="p-10"><EmptyState title="КП не найдено" text="Ссылка недействительна — уточните у менеджера" /></Card>;
  const expired = qq.validUntil && qq.validUntil < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Коммерческое предложение №{qq.number}</h1>
          <p className="text-sm text-ink-2">{qq.clientName}{qq.objectName && ` · ${qq.objectName}`} · от {fmtDate(qq.createdAt)}{qq.validUntil && ` · действительно до ${fmtDate(qq.validUntil)}`}</p>
          {expired && <p className="mt-1 text-sm font-semibold text-warning">Срок действия истёк — цены могли измениться</p>}
        </div>
        <a href={`/api/pdf/quote/${qq.id}?t=${encodeURIComponent(share)}`} className={buttonClass("primary")}><FileDown className="size-4" />Скачать PDF</a>
      </div>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {qq.lines.map((l, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-3 sm:px-5">
              <span className="w-6 shrink-0 text-xs text-ink-3">{i + 1}</span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{l.name}</p><p className="tnum text-xs text-ink-3">{num(l.qty)} {l.unit} × {money(l.price)}</p></div>
              <b className="tnum shrink-0 text-sm">{money(l.sum)}</b>
            </li>
          ))}
        </ul>
        <div className="flex items-baseline justify-between border-t border-line bg-surface-2 px-4 py-4 sm:px-5"><span className="font-bold">Итого</span><b className="tnum text-2xl">{money(qq.total)}</b></div>
        <p className="px-4 pb-4 text-xs text-ink-3 sm:px-5">{moneyInWords(qq.total)}</p>
      </Card>
      {qq.terms && <Card className="p-4 text-sm whitespace-pre-wrap sm:p-5"><b className="mb-1 block">Условия</b>{qq.terms}</Card>}
      {qq.author && <Card className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5"><span>Менеджер: <b>{qq.author.name}</b></span>{qq.author.phone && <a href={`tel:${qq.author.phone}`} className={buttonClass("secondary")}><Phone className="size-4" />{qq.author.phone}</a>}</Card>}
    </div>
  );
}
