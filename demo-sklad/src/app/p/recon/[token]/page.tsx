import { FileDown } from "lucide-react";
import { getDb } from "@/db";
import { linkViewer } from "@/lib/rbac";
import { verifyLink } from "@/lib/sign";
import { fmtDate, money } from "@/lib/format";
import { Card, EmptyState, buttonClass } from "@/components/ui";
import { reconciliation } from "@/modules/counterparties/service";
import { getSetting } from "@/modules/settings/store";

export const metadata = { title: "Акт сверки" };

export default async function PublicRecon({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = verifyLink<{ t: string; id: number; from: string; to: string; side: "client" | "supplier" }>(token);
  if (!link || link.t !== "recon") return <Card className="p-10"><EmptyState title="Ссылка недействительна" text="Срок действия истёк или ссылка повреждена — запросите новую у менеджера" /></Card>;
  const db = await getDb();
  const r = await reconciliation(db, linkViewer({ counterparties: "view" }), link.id, link.from, link.to, link.side);
  const company = await getSetting(db, "company");
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-extrabold">Акт сверки</h1><p className="text-sm text-ink-2">{company.legalName || company.name} и {r.counterparty.name} · {fmtDate(r.from)} – {fmtDate(r.to)}</p></div>
        <a href={`/api/pdf/recon/${link.id}?t=${encodeURIComponent(token)}`} className={buttonClass("primary")}><FileDown className="size-4" />Скачать PDF</a>
      </div>
      <Card className="overflow-hidden">
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Дата</th><th className="px-4 py-2.5">Документ</th><th className="px-4 py-2.5 text-right">Дебет</th><th className="px-4 py-2.5 text-right">Кредит</th></tr></thead>
            <tbody>
              <tr className="border-b border-line bg-surface-2"><td className="px-4 py-2" /><td className="px-4 py-2 font-semibold">Сальдо на начало</td><td className="tnum px-4 py-2 text-right">{r.opening > 0 ? money(r.opening) : ""}</td><td className="tnum px-4 py-2 text-right">{r.opening < 0 ? money(-r.opening) : ""}</td></tr>
              {r.rows.map((x, i) => <tr key={i} className="border-b border-line"><td className="px-4 py-2 whitespace-nowrap">{fmtDate(x.date)}</td><td className="px-4 py-2">{x.doc}</td><td className="tnum px-4 py-2 text-right">{x.debit ? money(x.debit) : ""}</td><td className="tnum px-4 py-2 text-right">{x.credit ? money(x.credit) : ""}</td></tr>)}
              <tr className="bg-surface-2 font-bold"><td /><td className="px-4 py-2.5">Обороты</td><td className="tnum px-4 py-2.5 text-right">{money(r.debit)}</td><td className="tnum px-4 py-2.5 text-right">{money(r.credit)}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="flex items-center justify-between p-4 sm:p-5"><span className="font-semibold">Сальдо на {fmtDate(r.to)}</span><b className="tnum text-xl">{money(r.closing)}</b></Card>
      {company.phone && <p className="text-sm text-ink-3">Вопросы по акту: {company.phone}</p>}
    </div>
  );
}
