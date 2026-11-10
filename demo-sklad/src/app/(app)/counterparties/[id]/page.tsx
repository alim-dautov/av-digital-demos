import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { AlertTriangle, ClipboardList, MessageCircle, Phone, Plus } from "lucide-react";
import { getDb } from "@/db";
import { q } from "@/db/sql";
import { requireUser } from "@/lib/auth";
import { can, NotFoundError } from "@/lib/rbac";
import { addDays, fmtDate, money, plural, today } from "@/lib/format";
import { SEGMENT_LABELS, type Segment } from "@/lib/labels";
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { BackLink } from "@/components/back-link";
import { getCounterparty, listTags, reconciliation, salesManagers } from "@/modules/counterparties/service";
import { CpForm } from "../_components/cp-form";
import { ReconTools } from "../_components/recon-tools";
import { PortalLink } from "../_components/portal-link";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [r] = await q<{ name: string }>(db, sql`select name from counterparties where id = ${Number((await params).id) || 0}`);
  return { title: r?.name ?? "Контрагент" };
}

export default async function CpPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; from?: string; to?: string; side?: string }> }) {
  const u = await requireUser("counterparties");
  const { id } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const cp = await getCounterparty(db, u, Number(id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const tab = sp.tab ?? "docs";
  const isSupplier = cp.kind === "supplier";
  const phone = (cp.whatsapp || cp.phone || "").replace(/\D/g, "");
  const base = `/counterparties/${cp.id}`;
  return (
    <>
      <PageHeader back={<BackLink href="/counterparties">Контрагенты</BackLink>} title={cp.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone="navy">{SEGMENT_LABELS[cp.segment as Segment]}</Badge>{cp.isService && <Badge tone="info">служебный</Badge>}{cp.tags.map((t) => <Badge key={t}>{t}</Badge>)}</span>}
        actions={<>
          {cp.phone && <a href={`tel:${cp.phone}`} className={buttonClass("secondary")}><Phone className="size-4" />Позвонить</a>}
          {phone && <a href={`https://wa.me/${phone}`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}><MessageCircle className="size-4" />WhatsApp</a>}
          {!isSupplier && can(u, "orders", "full") && <Link href={`/orders/new?cp=${cp.id}`} className={buttonClass("primary")}><Plus className="size-4" />Заявка</Link>}
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!isSupplier && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Долг клиента</p><p className={`tnum mt-1 text-xl font-extrabold ${cp.clientDebt > 0 ? (cp.debtLimit && cp.clientDebt > cp.debtLimit ? "text-danger" : "") : "text-success"}`}>{cp.clientDebt < 0 ? `аванс ${money(-cp.clientDebt)}` : money(cp.clientDebt)}</p></Card>}
        {!isSupplier && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Лимит</p><p className="tnum mt-1 text-xl font-extrabold">{cp.debtLimit ? money(cp.debtLimit) : "—"}</p></Card>}
        {!isSupplier && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Просрочка</p><p className={`tnum mt-1 text-xl font-extrabold ${cp.overdueDays > 14 ? "text-danger" : ""}`}>{cp.overdueDays ? `${cp.overdueDays} ${plural(cp.overdueDays, "день", "дня", "дней")}` : "—"}</p></Card>}
        {cp.kind !== "client" && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Мы должны</p><p className={`tnum mt-1 text-xl font-extrabold ${cp.ourDebt > 0 ? "text-warning" : ""}`}>{money(cp.ourDebt)}</p></Card>}
      </div>
      {cp.debtLimit > 0 && cp.clientDebt > cp.debtLimit && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger"><AlertTriangle className="size-5 shrink-0" />Долг превышает лимит на {money(cp.clientDebt - cp.debtLimit)}</div>
      )}
      {!cp.isService && <PortalLink cpId={cp.id} name={cp.name} phone={phone} manage={can(u, "counterparties", "full")}
        path={cp.portalToken ? `/p/client/${cp.portalToken}` : null} createdAt={cp.portalCreatedAt?.toISOString() ?? null} viewedAt={cp.portalViewedAt?.toISOString() ?? null} />}
      <Tabs active={tab} items={[
        { key: "docs", label: "Документы", href: `${base}?tab=docs` },
        { key: "recon", label: "Акт сверки", href: `${base}?tab=recon` },
        { key: "card", label: "Карточка", href: `${base}?tab=card` },
      ]} />
      {tab === "card" && <CardTab cpId={cp.id} edit={can(u, "counterparties", "full")} />}
      {tab === "docs" && <DocsTab cpId={cp.id} supplier={isSupplier} />}
      {tab === "recon" && <ReconTab cpId={cp.id} name={cp.name} phone={phone} sp={sp} defaultSide={isSupplier ? "supplier" : "client"} />}
    </>
  );

  async function CardTab({ cpId, edit }: { cpId: number; edit: boolean }) {
    const [managers, tags] = await Promise.all([salesManagers(db), listTags(db)]);
    void cpId;
    return (
      <div className="mx-auto max-w-3xl">
        <CpForm edit={edit} managers={managers} allTags={tags.map((t) => t.name)} initial={{
          id: cp.id, kind: cp.kind as "client", name: cp.name, segment: cp.segment as "other", tags: cp.tags, phone: cp.phone, whatsapp: cp.whatsapp, email: cp.email,
          address: cp.address, bin: cp.bin, comment: cp.comment, contacts: cp.contacts, documents: cp.documents, managerId: cp.managerId, debtLimit: cp.debtLimit,
          debtLimitMode: cp.debtLimitMode as "default", isService: cp.isService,
        }} />
      </div>
    );
  }
}

async function DocsTab({ cpId, supplier }: { cpId: number; supplier: boolean }) {
  const db = await getDb();
  const docs = supplier
    ? await q<{ kind: string; id: number; number: number; date: string; total: number; status: string | null; color: string | null }>(db, sql`
      select 'receipt' kind, r.id, r.number, r.date::text date, r.total::float8 total, case when r.posted then 'Проведена' else 'Черновик' end status, null color from receipts r where r.supplier_id = ${cpId} and r.deleted_at is null
      union all select 'payment', p.id, p.number, p.date::text, p.amount::float8, 'Оплата', null from payments p where p.counterparty_id = ${cpId} and p.direction = 'out' and p.deleted_at is null
      order by date desc, id desc limit 50`)
    : await q<{ kind: string; id: number; number: number; date: string; total: number; status: string | null; color: string | null }>(db, sql`
      select 'order' kind, o.id, o.number, (o.created_at at time zone 'Asia/Almaty')::date::text date, o.total::float8 total, s.name status, s.color from orders o join order_statuses s on s.id = o.status_id where o.counterparty_id = ${cpId} and o.deleted_at is null
      union all select s.kind, s.id, s.number, s.date::text, s.total::float8, case when s.posted then null else 'Черновик' end, null from shipments s where s.counterparty_id = ${cpId} and s.deleted_at is null
      union all select 'payment', p.id, p.number, p.date::text, p.amount::float8, null, null from payments p where p.counterparty_id = ${cpId} and p.direction = 'in' and p.deleted_at is null
      order by date desc, id desc limit 50`);
  const meta: Record<string, { t: string; href: string }> = {
    order: { t: "Заявка", href: "/orders/" }, shipment: { t: "Отгрузка", href: "/shipments/" }, return: { t: "Возврат", href: "/shipments/" },
    payment: { t: "Оплата", href: "/payments/" }, receipt: { t: "Приёмка", href: "/receipts/" },
  };
  if (!docs.length) return <Card><EmptyState icon={<ClipboardList />} title="Документов пока нет" /></Card>;
  return (
    <Card>
      <ul className="divide-y divide-line">
        {docs.map((d) => (
          <li key={`${d.kind}${d.id}`}>
            <Link href={`${meta[d.kind].href}${d.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{meta[d.kind].t} №{d.number}</span><span className="text-xs text-ink-3">{fmtDate(d.date)}</span></span>
              {d.status && (d.color ? <Badge color={d.color}>{d.status}</Badge> : <Badge>{d.status}</Badge>)}
              <span className={`tnum w-28 text-right text-sm font-bold ${d.kind === "payment" || d.kind === "return" ? "text-success" : ""}`}>{d.kind === "payment" || d.kind === "return" ? "−" : ""}{money(d.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

async function ReconTab({ cpId, name, phone, sp, defaultSide }: { cpId: number; name: string; phone: string; sp: { from?: string; to?: string; side?: string }; defaultSide: "client" | "supplier" }) {
  const u = await requireUser("counterparties");
  const db = await getDb();
  const to = sp.to ?? today();
  const from = sp.from ?? addDays(to, -90);
  const side = (sp.side === "supplier" || sp.side === "client" ? sp.side : defaultSide) as "client" | "supplier";
  const r = await reconciliation(db, u, cpId, from, to, side);
  const fmtBal = (v: number) => (v === 0 ? "0 ₸" : side === "client" ? (v > 0 ? `долг клиента ${money(v)}` : `аванс клиента ${money(-v)}`) : v < 0 ? `наш долг ${money(-v)}` : `переплата ${money(v)}`);
  return (
    <Card>
      <CardHeader title={`Акт сверки · ${fmtDate(from)} – ${fmtDate(to)}`} subtitle={name} />
      <ReconTools cpId={cpId} from={from} to={to} side={side} phone={phone} name={name} closing={fmtBal(r.closing)} />
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="border-y border-line bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Дата</th><th className="px-4 py-2.5">Документ</th><th className="px-4 py-2.5 text-right">Дебет</th><th className="px-4 py-2.5 text-right">Кредит</th></tr></thead>
          <tbody>
            <tr className="border-b border-line font-semibold"><td className="px-4 py-2.5" colSpan={2}>Сальдо на {fmtDate(from)}</td><td className="tnum px-4 py-2.5 text-right" colSpan={2}>{fmtBal(r.opening)}</td></tr>
            {r.rows.map((x, i) => (
              <tr key={i} className="border-b border-line hover:bg-surface-2">
                <td className="tnum px-4 py-2.5 whitespace-nowrap">{fmtDate(x.date)}</td>
                <td className="px-4 py-2.5"><Link href={x.link} className="hover:underline">{x.doc}</Link></td>
                <td className="tnum px-4 py-2.5 text-right">{x.debit ? money(x.debit) : ""}</td>
                <td className="tnum px-4 py-2.5 text-right">{x.credit ? money(x.credit) : ""}</td>
              </tr>
            ))}
            <tr className="border-b border-line font-semibold"><td className="px-4 py-2.5" colSpan={2}>Обороты за период</td><td className="tnum px-4 py-2.5 text-right">{money(r.debit)}</td><td className="tnum px-4 py-2.5 text-right">{money(r.credit)}</td></tr>
            <tr className="bg-yellow-50 font-extrabold dark:bg-white/5"><td className="px-4 py-3" colSpan={2}>Сальдо на {fmtDate(to)}</td><td className="tnum px-4 py-3 text-right" colSpan={2}>{fmtBal(r.closing)}</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}
