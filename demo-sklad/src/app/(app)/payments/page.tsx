import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Search, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { PAY_METHODS } from "@/lib/labels";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, Stat, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { PaymentButton } from "@/components/payment-modal";
import { listPayments } from "@/modules/finance/service";
import { debtSummary } from "@/modules/counterparties/service";
import { NewPayment } from "./_components/new-payment";

export const metadata = { title: "Платежи и долги" };
type SP = { tab?: string; q?: string; from?: string; to?: string; page?: string };

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("payments");
  const sp = await searchParams;
  const db = await getDb();
  const tab = sp.tab ?? "in";
  const full = can(u, "payments", "full");
  const href = (o: Partial<SP>) => `/payments?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const debts = await debtSummary(db, u);
  const tabs = [
    { key: "in", label: "Поступления", href: href({ tab: "in" }) }, { key: "out", label: "Выплаты", href: href({ tab: "out" }) },
    { key: "debtors", label: "Нам должны", href: href({ tab: "debtors" }), count: debts.debtors.length }, { key: "creditors", label: "Мы должны", href: href({ tab: "creditors" }), count: debts.creditors.length },
  ];
  return (
    <>
      <PageHeader title="Платежи и долги" subtitle="оплата закрывает заявку автоматически, если долг погашен" actions={full && <NewPayment />} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4">
        <Stat label="Нам должны" value={money(debts.owedToUs)} tone="warn" />
        <Stat label="Мы должны поставщикам" value={money(debts.weOwe)} />
      </div>
      <Tabs active={tab} items={tabs} />
      {tab === "debtors" || tab === "creditors" ? <Debts tab={tab} debts={debts} full={full} /> : <Payments sp={sp} tab={tab} href={href} />}
    </>
  );

  async function Payments({ sp, tab, href }: { sp: SP; tab: string; href: (o: Partial<SP>) => string }) {
    const list = await listPayments(db, u, { direction: tab, q: sp.q, from: sp.from, to: sp.to, page: Number(sp.page) || 1 });
    type R = (typeof list.rows)[number];
    return (
      <Card className="overflow-hidden">
        <form className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-[1fr_150px_150px_auto] sm:p-4" action="/payments">
          <input type="hidden" name="tab" value={tab} />
          <div className="col-span-2 sm:col-span-1"><Input name="q" defaultValue={sp.q} placeholder="Контрагент" icon={<Search />} type="search" /></div>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="С" /><Input type="date" name="to" defaultValue={sp.to} aria-label="По" />
          <button className={buttonClass("secondary")}>Найти</button>
        </form>
        <div className="border-b border-line px-4 py-2 text-sm text-ink-3">Итого за выборку: <b className="tnum text-ink">{money(list.sum)}</b></div>
        <DataTable<R> rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => `/payments/${r.id}`}
          empty={<EmptyState icon={<Wallet />} title="Платежей нет" />}
          columns={[
            { key: "n", header: "№", cell: (r) => r.number },
            { key: "d", header: "Дата", cell: (r) => fmtDate(r.date), className: "whitespace-nowrap" },
            { key: "cp", header: "Контрагент", cell: (r) => <span className="block max-w-[240px] truncate">{r.counterpartyName}</span> },
            { key: "doc", header: "Основание", cell: (r) => r.orderNumber ? `Заявка №${r.orderNumber}` : r.receiptId ? "Приёмка" : <span className="text-ink-3">—</span>, hideMd: true },
            { key: "m", header: "Способ", cell: (r) => <Badge tone="neutral">{PAY_METHODS[r.method as keyof typeof PAY_METHODS] ?? r.method}</Badge>, hideMd: true },
            { key: "a", header: "Сумма", align: "right", cell: (r) => <b className={r.direction === "in" ? "text-success" : ""}>{r.direction === "in" ? "+" : "−"}{money(r.amount)}</b> },
          ]}
          mobile={(r) => (
            <div className="flex items-center gap-3">
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${r.direction === "in" ? "bg-success-bg text-success" : "bg-surface-2 text-ink-2"}`}>{r.direction === "in" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{r.counterpartyName}</p><p className="text-xs text-ink-3">{fmtDate(r.date)} · {PAY_METHODS[r.method as keyof typeof PAY_METHODS] ?? r.method}{r.orderNumber ? ` · №${r.orderNumber}` : ""}</p></div>
              <span className={`tnum text-sm font-bold ${r.direction === "in" ? "text-success" : ""}`}>{money(r.amount)}</span>
            </div>
          )} />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => `${href({})}&page=${p}`} />
      </Card>
    );
  }
}

function Debts({ tab, debts, full }: { tab: string; debts: Awaited<ReturnType<typeof debtSummary>>; full: boolean }) {
  if (tab === "creditors") {
    return (
      <Card className="overflow-hidden">
        <CardHeader title="Долги поставщикам" />
        {debts.creditors.length ? <ul className="divide-y divide-line">{debts.creditors.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
            <Link href={`/counterparties/${r.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">{r.name}</Link>
            <b className="tnum text-danger">{money(r.our_debt)}</b>
            {full && <PaymentButton direction="out" counterparty={{ id: r.id, name: r.name }} amount={r.our_debt} label="Оплатить" />}
          </li>))}</ul> : <EmptyState icon={<Wallet />} title="Долгов нет" />}
      </Card>
    );
  }
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Дебиторка" subtitle="просрочка считается от самой старой неоплаченной отгрузки" />
      {debts.debtors.length ? <ul className="divide-y divide-line">{debts.debtors.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <Link href={`/counterparties/${r.id}`} className="block truncate font-semibold hover:underline">{r.name}</Link>
            <p className="text-xs text-ink-3">{r.manager ?? "без менеджера"}{r.debt_limit > 0 && ` · лимит ${money(r.debt_limit)}`}</p>
          </div>
          {r.overdueDays > 0 && <Badge tone={r.overdueDays > 30 ? "danger" : "warning"}>{r.overdueDays} дн.</Badge>}
          {r.debt_limit > 0 && r.client_debt > r.debt_limit && <Badge tone="danger">превышен лимит</Badge>}
          <b className="tnum">{money(r.client_debt)}</b>
          {full && <PaymentButton direction="in" counterparty={{ id: r.id, name: r.name }} amount={r.client_debt} label="Оплата" />}
        </li>))}</ul> : <EmptyState icon={<Wallet />} title="Никто не должен" />}
    </Card>
  );
}
