import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payrollPeriods } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { canPayroll, flag } from "@/lib/rbac";
import { addDays, fmtDate, money, today } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { activeUsers } from "@/modules/counterparties/service";
import { listAccounts } from "@/modules/finance/service";
import { getSetting } from "@/modules/settings/store";
import { currentPeriodKey, getTimesheet, listPayMoney, listRules, listSchemes, payrollSheet } from "@/modules/payroll/service";
import { periodFromKey } from "@/modules/payroll/engine";
import type { PaySchemeComponents } from "@/modules/payroll/types";
import { recentPeriodKeys } from "./_components/payslip-view";
import { AdjustButton, DeleteMoney, PayButton, PeriodLock, PeriodSelect } from "./_components/payroll-tools";
import { TimesheetGrid } from "./_components/timesheet-grid";
import { SchemeButton } from "./_components/scheme-editor";
import { schemeSummary } from "./_components/scheme-summary";
import { RuleButton, type Rule } from "./_components/rule-editor";

export const metadata = { title: "Зарплата" };
type SP = { tab?: string; period?: string; month?: string };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser();
  if (!canPayroll(u)) redirect("/");
  const seeAll = flag(u, "seeSalaries");
  const ts = flag(u, "payrollTimesheet");
  if (!seeAll && !ts) redirect("/payroll/me");
  const sp = await searchParams;
  const db = await getDb();
  const cfg = await getSetting(db, "payroll");
  const key = sp.period ?? currentPeriodKey(cfg.periodKind);
  const keys = recentPeriodKeys(cfg.periodKind, currentPeriodKey, addDays(today(), 0));
  if (!keys.includes(key)) keys.unshift(key);
  const labels = Object.fromEntries(keys.map((k) => [k, periodFromKey(k).label]));
  const tab = sp.tab ?? (seeAll ? "sheet" : "timesheet");
  const people = (await activeUsers(db)).map((p) => ({ id: p.id, name: p.name, position: p.position }));
  const href = (t: string) => `/payroll?${new URLSearchParams({ tab: t, period: key })}`;
  const tabs = [
    ...(seeAll ? [{ key: "sheet", label: "Ведомость", href: href("sheet") }] : []),
    { key: "timesheet", label: "Табель", href: href("timesheet") },
    ...(seeAll ? [{ key: "money", label: "Авансы и выплаты", href: href("money") }, { key: "schemes", label: "Схемы оплаты", href: href("schemes") }, { key: "rules", label: "Правила начислений", href: href("rules") }] : []),
  ];
  const accounts = (await listAccounts(db)).filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }));
  return (
    <>
      <PageHeader title="Зарплата" subtitle="расчёт по схемам оплаты, табелю и начислениям с заявок"
        actions={<>
          <PeriodSelect keys={keys} labels={labels} value={key} />
          <Link href="/payroll/me" className={buttonClass("ghost")}>Мой расчёт</Link>
        </>} />
      <Tabs active={tab} items={tabs} />
      {tab === "sheet" && seeAll && await Sheet()}
      {tab === "timesheet" && await Timesheet()}
      {tab === "money" && seeAll && await Money()}
      {tab === "schemes" && seeAll && await Schemes()}
      {tab === "rules" && seeAll && await Rules()}
    </>
  );

  async function Sheet() {
    const s = await payrollSheet(db, u, key);
    const tot = s.slips.reduce((a, x) => ({ accrued: a.accrued + x.slip.accrued, adv: a.adv + x.slip.advances, paid: a.paid + x.slip.payouts, left: a.left + x.slip.balanceAfterPayouts }), { accrued: 0, adv: 0, paid: 0, left: 0 });
    const pay = flag(u, "payrollPay");
    return (
      <Card className="overflow-hidden">
        <CardHeader title={<span className="flex items-center gap-2">Ведомость · {s.period.label}{s.closed && <Badge tone="neutral">закрыт {s.closedAt ? fmtDate(s.closedAt) : ""}</Badge>}</span>}
          action={<div className="flex flex-wrap gap-2">
            {pay && !s.closed && <AdjustButton people={people} />}
            <a href={`/api/payroll/sheet?period=${key}`} className={buttonClass("ghost", "sm")}><FileSpreadsheet className="size-4" />Excel</a>
            {flag(u, "payrollClosePeriod") && <PeriodLock periodKey={key} closed={s.closed} />}
          </div>} />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-ink-3">
              <th className="px-4 py-2.5">Сотрудник</th><th className="px-4 py-2.5 text-right">Начислено</th><th className="px-4 py-2.5 text-right">Аванс</th><th className="px-4 py-2.5 text-right">Выплачено</th><th className="px-4 py-2.5 text-right">Остаток</th><th className="px-4 py-2.5" />
            </tr></thead>
            <tbody>
              {s.slips.map(({ user, slip }) => (
                <tr key={user.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5"><Link href={`/payroll/${user.id}?period=${key}`} className="font-semibold hover:underline">{user.name}</Link><p className="text-xs text-ink-3">{slip.lines.map((l) => l.label).join(" · ") || "нет начислений"}</p></td>
                  <td className="tnum px-4 py-2.5 text-right font-semibold">{money(slip.accrued)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{money(slip.advances)}</td>
                  <td className="tnum px-4 py-2.5 text-right">{money(slip.payouts)}</td>
                  <td className={`tnum px-4 py-2.5 text-right font-bold ${slip.balanceAfterPayouts < 0 ? "text-danger" : ""}`}>{money(slip.balanceAfterPayouts)}</td>
                  <td className="px-4 py-2.5"><div className="flex justify-end gap-1.5">
                    {pay && <PayButton kind="advance" userId={user.id} name={user.name} periodKey={key} amount={0} accounts={accounts} />}
                    {pay && slip.balanceAfterPayouts > 0 && <PayButton kind="payout" userId={user.id} name={user.name} periodKey={key} amount={slip.balanceAfterPayouts} accounts={accounts} />}
                  </div></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-surface-2 font-bold"><td className="px-4 py-3">Итого</td><td className="tnum px-4 py-3 text-right">{money(tot.accrued)}</td><td className="tnum px-4 py-3 text-right">{money(tot.adv)}</td><td className="tnum px-4 py-3 text-right">{money(tot.paid)}</td><td className="tnum px-4 py-3 text-right">{money(tot.left)}</td><td /></tr></tfoot>
          </table>
        </div>
      </Card>
    );
  }

  async function Timesheet() {
    const p = periodFromKey(key);
    const month = sp.month ?? p.start.slice(0, 7);
    const t = await getTimesheet(db, u, month);
    const days: string[] = [];
    for (let d = t.start; d <= t.end; d = addDays(d, 1)) days.push(d);
    const [pp] = await db.select({ closed: payrollPeriods.closed }).from(payrollPeriods).where(eq(payrollPeriods.periodKey, month));
    const closed = !!pp?.closed;
    return (
      <Card className="p-4 sm:p-5">
        <form className="mb-4 flex items-end gap-2" action="/payroll">
          <input type="hidden" name="tab" value="timesheet" /><input type="hidden" name="period" value={key} />
          <input type="month" name="month" defaultValue={month} className="h-11 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Месяц" />
          <button className={buttonClass("secondary")}>Показать</button>
          {closed && <Badge tone="neutral">период закрыт</Badge>}
        </form>
        <TimesheetGrid days={days} people={people} rows={t.rows.map((r) => ({ userId: r.userId, date: r.date, status: r.status, hours: Number(r.hours) }))} editable={ts} closed={closed} />
      </Card>
    );
  }

  async function Money() {
    const m = await listPayMoney(db, u, key);
    const del = flag(u, "payrollPay");
    const block = (title: string, rows: { id: number; name: string; date: string; amount: number; comment: string; extra?: string }[], kind: "advance" | "payout" | "adjustment") => (
      <Card>
        <CardHeader title={title} />
        {rows.length ? <ul className="divide-y divide-line">{rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
            <div className="min-w-0 flex-1"><p className="font-semibold">{r.name}{r.extra && <span className="ml-2 text-xs font-normal text-ink-3">{r.extra}</span>}</p><p className="truncate text-xs text-ink-3">{fmtDate(r.date)}{r.comment && ` · ${r.comment}`}</p></div>
            <b className="tnum">{money(r.amount)}</b>{del && <DeleteMoney kind={kind} id={r.id} />}
          </li>))}</ul> : <EmptyState title="Пусто" />}
      </Card>
    );
    const ADJ = { bonus: "бонус", penalty: "штраф", expense: "расход", weekend: "выходной", overtime: "сверхурочные" } as Record<string, string>;
    return (
      <div className="grid gap-5 lg:grid-cols-3">
        {block("Авансы", m.advances.map((x) => ({ ...x.r, name: x.name })), "advance")}
        {block("Выплаты", m.payouts.map((x) => ({ ...x.r, name: x.name })), "payout")}
        {block("Бонусы, штрафы, расходы", m.adjustments.map((x) => ({ ...x.r, name: x.name, extra: ADJ[x.r.type] })), "adjustment")}
      </div>
    );
  }

  async function Schemes() {
    const all = await listSchemes(db, u);
    const edit = flag(u, "payrollEditSchemes");
    return (
      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {people.map((p) => {
            const versions = all.filter((s) => s.s.userId === p.id);
            const cur = versions.find((s) => s.s.validFrom <= today()) ?? versions[0];
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.name} <span className="text-xs font-normal text-ink-3">{p.position}</span></p>
                  <p className="text-sm text-ink-2">{schemeSummary((cur?.s.components as PaySchemeComponents) ?? null)}</p>
                  {versions.length > 0 && <p className="text-xs text-ink-3">версий: {versions.length} · текущая с {fmtDate(cur!.s.validFrom)}{versions.some((v) => v.s.validFrom > today()) && " · есть будущая"}</p>}
                </div>
                {edit && <SchemeButton userId={p.id} name={p.name} current={(cur?.s.components as PaySchemeComponents) ?? null} />}
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  async function Rules() {
    const rules = await listRules(db, u);
    const edit = flag(u, "payrollEditSchemes");
    const name = new Map(people.map((p) => [p.id, p.name]));
    const BASE = { order_total: "суммы заявки", shipment_revenue: "отгрузки", profit: "прибыли" } as Record<string, string>;
    const MOM = { order_created: "при создании", shipment: "после отгрузки", paid: "после оплаты" } as Record<string, string>;
    return (
      <Card className="overflow-hidden">
        <CardHeader title="Начисления с заявок по автору" subtitle="процент закрепляется за заявкой и пересчитывается при изменении" action={edit && <RuleButton people={people} />} />
        {rules.length ? <ul className="divide-y divide-line">{rules.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.name} {!r.active && <Badge tone="neutral">выкл</Badge>}</p>
              <p className="text-xs text-ink-3">
                Автор: {r.authorMatch === "user" ? name.get(r.authorUserId!) ?? "—" : r.authorMatch === "sales_manager" ? "любой менеджер" : "любой"} → получает {r.recipientMode === "author" ? "автор" : r.recipientMode === "manager" ? "менеджер клиента" : name.get(r.recipientUserId!) ?? "—"}
                {" · "}<b className="text-ink">{String(r.rateBp / 100).replace(".", ",")}%</b> от {BASE[r.base]}, {MOM[r.moment]}{r.segment && ` · сегмент ${r.segment}`}
              </p>
            </div>
            {edit && <RuleButton people={people} rule={{ ...r, authorMatch: r.authorMatch as Rule["authorMatch"], recipientMode: r.recipientMode as Rule["recipientMode"], base: r.base as Rule["base"], moment: r.moment as Rule["moment"], segment: r.segment as Rule["segment"] }} />}
          </li>))}</ul> : <EmptyState title="Правил нет" />}
      </Card>
    );
  }
}
