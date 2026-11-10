import { Landmark } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, Input, PageHeader, Stat, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { BarsChart } from "@/components/charts-lazy";
import { accountBalances, cashFlow, listAccounts, listCategories, listFinTx } from "@/modules/finance/service";
import { defaultRange } from "@/modules/analytics/service";
import { DeleteTx, FinTxButtons } from "./_components/fin-tools";

export const metadata = { title: "Финансы" };
type SP = { tab?: string; from?: string; to?: string; acc?: string; page?: string };

export default async function FinancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("finance");
  const sp = await searchParams;
  const db = await getDb();
  const rg = { ...defaultRange(), ...(sp.from ? { from: sp.from } : {}), ...(sp.to ? { to: sp.to } : {}) };
  const [bal, accounts, cats] = await Promise.all([accountBalances(db, u), listAccounts(db), listCategories(db)]);
  const tab = sp.tab ?? "ops";
  const full = can(u, "finance", "full");
  const accName = new Map(accounts.map((a) => [a.id, a.name]));
  const href = (o: Partial<SP>) => `/finance?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const period = (
    <form className="flex flex-wrap items-end gap-2 border-b border-line p-3 sm:p-4" action="/finance">
      <input type="hidden" name="tab" value={tab} />
      <Input type="date" name="from" defaultValue={rg.from} className="max-w-44" aria-label="С" /><Input type="date" name="to" defaultValue={rg.to} className="max-w-44" aria-label="По" />
      {tab === "ops" && <select name="acc" defaultValue={sp.acc ?? ""} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Касса"><option value="">Все кассы</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}
      <button className={buttonClass("secondary")}>Показать</button>
    </form>
  );
  return (
    <>
      <PageHeader title="Финансы" subtitle="кассы, операции и движение денег (ДДС). Оплаты клиентов и поставщиков попадают сюда автоматически"
        actions={full && <FinTxButtons accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))} categories={cats} />} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {bal.map((a) => <Stat key={a.id} label={a.name} value={money(a.balance)} tone={a.balance < 0 ? "down" : undefined} />)}
        <Stat label="Итого" value={money(bal.reduce((s, a) => s + a.balance, 0))} />
      </div>
      <Tabs active={tab} items={[{ key: "ops", label: "Операции", href: href({ tab: "ops" }) }, { key: "dds", label: "ДДС", href: href({ tab: "dds" }) }]} />
      {tab === "dds" ? await Dds() : await Ops()}
    </>
  );

  async function Ops() {
    const list = await listFinTx(db, u, { from: rg.from, to: rg.to, accountId: sp.acc ? Number(sp.acc) : undefined, page: Number(sp.page) || 1 });
    type R = (typeof list.rows)[number];
    const sign = (r: R) => (r.kind === "income" ? "+" : r.kind === "expense" ? "−" : "");
    return (
      <Card className="overflow-hidden">
        {period}
        <DataTable<R> rows={list.rows} rowKey={(r) => r.id} empty={<EmptyState icon={<Landmark />} title="Операций за период нет" />}
          columns={[
            { key: "d", header: "Дата", cell: (r) => fmtDate(r.date), className: "whitespace-nowrap" },
            { key: "k", header: "Тип", cell: (r) => r.kind === "income" ? <Badge tone="success">приход</Badge> : r.kind === "expense" ? <Badge tone="danger">расход</Badge> : <Badge tone="info">перевод</Badge> },
            { key: "c", header: "Статья", cell: (r) => r.kind === "transfer" ? `${accName.get(r.accountId)} → ${accName.get(r.toAccountId!)}` : <>{r.categoryName ?? "—"}{r.employeeName && <span className="text-ink-3"> · {r.employeeName}</span>}</> },
            { key: "a", header: "Касса", cell: (r) => accName.get(r.accountId), hideMd: true },
            { key: "m", header: "Комментарий", cell: (r) => <span className="block max-w-[260px] truncate text-ink-3">{r.comment || "—"}</span>, hideMd: true },
            { key: "s", header: "Сумма", align: "right", cell: (r) => <b className={r.kind === "income" ? "text-success" : r.kind === "expense" ? "text-danger" : ""}>{sign(r)}{money(r.amount)}</b> },
            ...(full ? [{ key: "x", header: "", cell: (r: R) => !r.paymentId && r.categoryCode !== "salary" ? <DeleteTx id={r.id} /> : null }] : []),
          ]}
          mobile={(r) => (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.kind === "transfer" ? "Перевод" : r.categoryName ?? "—"}</p><p className="truncate text-xs text-ink-3">{fmtDate(r.date)} · {accName.get(r.accountId)}{r.comment && ` · ${r.comment}`}</p></div>
              <b className={`tnum shrink-0 text-sm ${r.kind === "income" ? "text-success" : r.kind === "expense" ? "text-danger" : ""}`}>{sign(r)}{money(r.amount)}</b>
            </div>
          )} />
        <Pagination page={list.page} pageSize={50} total={list.total} href={(p) => `${href({})}&page=${p}`} />
      </Card>
    );
  }

  async function Dds() {
    const cf = await cashFlow(db, u, rg.from, rg.to);
    return (
      <div className="flex flex-col gap-5">
        <Card className="overflow-hidden">{period}
          <div className="grid grid-cols-3 gap-3 p-4 sm:p-5">
            <Stat label="Поступления" value={money(cf.income)} tone="up" /><Stat label="Выплаты" value={money(cf.expense)} tone="down" /><Stat label="Чистый поток" value={money(cf.net)} tone={cf.net < 0 ? "down" : "up"} />
          </div>
          <div className="px-2 pb-4"><BarsChart data={cf.byDay.map((d) => ({ name: fmtDate(d.d).slice(0, 5), income: d.income, expense: d.expense }))} keys={[{ key: "income", name: "Приход" }, { key: "expense", name: "Расход" }]} /></div>
        </Card>
        <div className="grid gap-5 lg:grid-cols-2">
          {(["income", "expense"] as const).map((k) => (
            <Card key={k}>
              <CardHeader title={k === "income" ? "Поступления по статьям" : "Расходы по статьям"} />
              <ul className="divide-y divide-line">
                {cf.rows.filter((r) => r.kind === k).map((r) => <li key={r.category} className="flex justify-between px-4 py-2.5 text-sm sm:px-5"><span>{r.category}</span><b className="tnum">{money(r.amount)}</b></li>)}
                {!cf.rows.some((r) => r.kind === k) && <li className="px-5 py-4 text-sm text-ink-3">Нет операций</li>}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    );
  }
}
