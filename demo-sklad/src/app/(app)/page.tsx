import Link from "next/link";
import { Suspense } from "react";
import { sql } from "drizzle-orm";
import { AlertTriangle, ArrowRight, Boxes, ClipboardList, Coins, Kanban, PackageCheck, TrendingUp, Wallet } from "lucide-react";
import { getDb } from "@/db";
import { q } from "@/db/sql";
import { requireUser, type SessionUser } from "@/lib/auth";
import { can, canPayroll, flag, MODULES, type ModuleKey } from "@/lib/rbac";
import { addDays, fmtDate, money, num, pct, plural, today } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, Progress, Skeleton, Stat, buttonClass } from "@/components/ui";
import { RevenueChart } from "@/components/area-chart";
import { kpis, managersVsPlan } from "@/modules/analytics/service";
import { debtSummary } from "@/modules/counterparties/service";
import { currentPeriodKey, payslip } from "@/modules/payroll/service";
import { getSetting } from "@/modules/settings/store";

export const metadata = { title: "Главная" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const u = await requireUser();
  const { denied } = await searchParams;
  const hour = Number(new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", hour: "numeric" }).format(new Date()));
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <div>
        <p className="text-sm font-medium text-ink-3">{new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Almaty", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
        <h1 className="text-[24px] font-extrabold tracking-tight sm:text-[30px]">{hello}, {u.name.split(" ")[0]}!</h1>
      </div>
      {denied && (
        <div className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm">
          <AlertTriangle className="size-5 shrink-0 text-warning" />Нет доступа к разделу «{MODULES[denied as ModuleKey] ?? denied}». Обратитесь к руководителю.
        </div>
      )}
      <Suspense fallback={<StatsSkeleton />}><TopStats u={u} /></Suspense>
      <div className="grid gap-5 lg:grid-cols-3 sm:gap-6">
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-span-2">
          {can(u, "analytics") && <Suspense fallback={<CardSkeleton h={320} />}><SalesCard u={u} /></Suspense>}
          {can(u, "orders") && <Suspense fallback={<CardSkeleton h={280} />}><OrdersToday u={u} /></Suspense>}
        </div>
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
          {canPayroll(u) && flag(u, "seeOwnEarnings") && <Suspense fallback={<CardSkeleton h={220} />}><MyEarnings u={u} /></Suspense>}
          {can(u, "tasks") && <Suspense fallback={<CardSkeleton h={240} />}><MyTasks u={u} /></Suspense>}
          {can(u, "payments") && <Suspense fallback={<CardSkeleton h={240} />}><Debtors u={u} /></Suspense>}
        </div>
      </div>
    </div>
  );
}

function StatsSkeleton() { return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)}</div>; }
function CardSkeleton({ h }: { h: number }) { return <div className="skeleton w-full rounded-2xl" style={{ height: h }} />; }

async function TopStats({ u }: { u: SessionUser }) {
  const db = await getDb();
  const d = today();
  const tiles: React.ReactNode[] = [];
  if (can(u, "analytics")) {
    const k = await kpis(db, u, addDays(d, -29), d);
    const prev = await kpis(db, u, addDays(d, -59), addDays(d, -30));
    const delta = prev.revenue ? ((k.revenue - prev.revenue) / prev.revenue) * 100 : null;
    tiles.push(<Stat key="rev" label="Выручка за 30 дней" value={money(k.revenue)} icon={<TrendingUp />} hint={delta != null ? `${delta >= 0 ? "+" : ""}${pct(delta)} к прошлым 30 дням` : "по отгрузкам"} tone={delta == null ? undefined : delta >= 0 ? "up" : "down"} />);
    if (k.profit != null) tiles.push(<Stat key="pr" label="Прибыль" value={money(k.profit)} icon={<Coins />} hint={k.marginPct != null ? `маржа ${pct(k.marginPct)}` : undefined} />);
    tiles.push(<Stat key="ord" label="Заявок за 30 дней" value={num(k.orders)} icon={<ClipboardList />} hint={`средний чек ${money(k.avgCheck)}`} />);
  } else if (can(u, "orders")) {
    const [r] = await q<{ c: number; s: number }>(db, sql`select count(*)::int c, coalesce(sum(total),0)::float8 s from orders where deleted_at is null and (author_id = ${u.id} or manager_id = ${u.id}) and (created_at at time zone 'Asia/Almaty')::date >= ${d.slice(0, 8) + "01"}`);
    tiles.push(<Stat key="my" label="Мои заявки за месяц" value={num(r?.c ?? 0)} icon={<ClipboardList />} hint={money(Number(r?.s ?? 0))} />);
  }
  if (u.isAssembler || can(u, "orders")) {
    const [a] = await q<{ c: number }>(db, sql`select count(*)::int c from orders o join order_statuses s on s.id = o.status_id where o.deleted_at is null and o.assembly_status <> 'assembled' and not s.is_final and not s.is_cancelled and s.code <> 'new'`);
    tiles.push(<Link key="asm" href="/orders?assembly=todo" className="contents"><Stat label="Ждут сборки" value={num(a?.c ?? 0)} icon={<PackageCheck />} hint="открыть режим сборщика →" tone={(a?.c ?? 0) > 0 ? "warn" : undefined} /></Link>);
  }
  if (can(u, "stock")) {
    const [n] = await q<{ c: number }>(db, sql`select count(*)::int c from products p join (select product_id, sum(qty) qty from (
      select ri.product_id, ri.qty from receipt_items ri join receipts r on r.id = ri.receipt_id where r.posted and r.deleted_at is null and not ri.excluded and r.date <= ${d}
      union all select si.product_id, case when s.kind='return' then si.qty else -si.qty end from shipment_items si join shipments s on s.id = si.shipment_id where s.posted and s.deleted_at is null
    ) m group by product_id) st on st.product_id = p.id where p.deleted_at is null and st.qty < 0`);
    if (tiles.length < 4) tiles.push(<Link key="neg" href="/stock?tab=negative" className="contents"><Stat label="Минусовые остатки" value={num(n?.c ?? 0)} icon={<Boxes />} hint={(n?.c ?? 0) ? "нужна приёмка →" : "всё в порядке"} tone={(n?.c ?? 0) ? "down" : "up"} /></Link>);
  }
  if (!tiles.length) return null;
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{tiles.slice(0, 4)}</div>;
}

async function SalesCard({ u }: { u: SessionUser }) {
  const db = await getDb();
  const d = today();
  const k = await kpis(db, u, addDays(d, -29), d);
  const plan = await managersVsPlan(db, u, d);
  return (
    <Card>
      <CardHeader title="Продажи за 30 дней" subtitle={k.profit != null ? "выручка и прибыль по отгрузкам" : "выручка по отгрузкам"} action={<Link href="/analytics" className={buttonClass("ghost", "sm")}>Аналитика <ArrowRight className="size-4" /></Link>} />
      <div className="p-2 pt-4 sm:p-4">
        {k.series.length ? <RevenueChart data={k.series} /> : <EmptyState title="Пока нет отгрузок" text="График появится после первых проведённых отгрузок" />}
      </div>
      {plan.rows.length > 0 && (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <p className="mb-3 text-[13px] font-bold">План недели · {fmtDate(plan.start).slice(0, 5)}–{fmtDate(plan.end).slice(0, 5)}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {plan.rows.map((r) => (
              <div key={r.id}>
                <div className="mb-1.5 flex items-baseline justify-between text-sm"><span className="font-semibold">{r.name}</span><span className="tnum text-xs text-ink-3">{money(r.revenue)} / {money(r.plan)}</span></div>
                <Progress value={r.pct} tone={r.pct >= 100 ? "success" : r.pct >= 60 ? "yellow" : "navy"} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

async function OrdersToday({ u }: { u: SessionUser }) {
  const db = await getDb();
  const d = today();
  const mine = !u.isOwner && !can(u, "team", "full") && u.isSalesManager;
  const rows = await q<{ id: number; number: number; cp: string; total: number; status: string; color: string; delivery: string | null; asm: string }>(db, sql`
    select o.id, o.number, c.name cp, o.total::float8 total, s.name status, s.color, o.delivery_date::text delivery, o.assembly_status asm
    from orders o join counterparties c on c.id = o.counterparty_id join order_statuses s on s.id = o.status_id
    where o.deleted_at is null and not s.is_final and not s.is_cancelled and (o.delivery_date <= ${addDays(d, 1)} or o.delivery_date is null)
    ${mine ? sql`and (o.manager_id = ${u.id} or o.author_id = ${u.id})` : sql``}
    order by o.delivery_date nulls last, o.id desc limit 8`);
  return (
    <Card>
      <CardHeader title="Заявки на сегодня и завтра" subtitle={mine ? "ваши активные заявки" : "активные, к доставке"} action={<Link href="/orders" className={buttonClass("ghost", "sm")}>Все <ArrowRight className="size-4" /></Link>} />
      {rows.length === 0 ? <EmptyState icon={<ClipboardList />} title="Нет активных заявок" text="Новую заявку можно создать кнопкой «+»" /> : (
        <ul className="divide-y divide-line">
          {rows.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2 sm:px-5">
                <span className="tnum w-14 shrink-0 text-xs font-bold text-ink-3">№{o.number}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{o.cp}</span>
                  <span className="block text-xs text-ink-3">{o.delivery ? (o.delivery < d ? <span className="text-danger">просрочена · {fmtDate(o.delivery)}</span> : o.delivery === d ? "сегодня" : "завтра") : "без даты"}{o.asm === "assembled" ? " · собрана" : ""}</span>
                </span>
                <Badge color={o.color} className="hidden sm:inline-flex">{o.status}</Badge>
                <span className="tnum shrink-0 text-sm font-bold">{money(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function MyEarnings({ u }: { u: SessionUser }) {
  const db = await getDb();
  const s = await getSetting(db, "payroll");
  const key = currentPeriodKey(s.periodKind);
  let slip: Awaited<ReturnType<typeof payslip>>;
  try { slip = await payslip(db, u, u.id, key); } catch { return null; }
  if (!slip.lines.length && slip.accrued === 0 && slip.toPay === 0) return null;
  return (
    <Card className="overflow-hidden">
      <div className="relative bg-navy p-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full border-[24px] border-white/5" />
        <p className="text-xs font-semibold uppercase tracking-wider text-white/60">Мой заработок · {slip.period.label}</p>
        <p className="tnum mt-1 text-[30px] font-extrabold tracking-tight">{money(slip.accrued)}</p>
        <p className="text-xs text-white/60">{slip.closed ? "период закрыт" : "предварительно, обновляется онлайн"}</p>
      </div>
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        {slip.planProgressPct > 0 && (
          <div>
            <div className="mb-1.5 flex justify-between text-xs"><span className="font-semibold">План</span><span className="tnum text-ink-3">{pct(slip.planProgressPct, 0)}</span></div>
            <Progress value={slip.planProgressPct} tone="yellow" />
            {slip.nextTier && <p className="mt-1.5 text-xs text-ink-3">До ставки {(slip.nextTier.rateBp / 100).toString().replace(".", ",")}% осталось продать {money(slip.nextTier.remaining)}</p>}
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-ink-3">Авансы</dt><dd className="tnum text-right font-semibold">{money(slip.advances)}</dd>
          {slip.carryIn !== 0 && <><dt className="text-ink-3">Перенос</dt><dd className="tnum text-right font-semibold">{money(slip.carryIn)}</dd></>}
          <dt className="text-ink-3">К выплате</dt><dd className="tnum text-right font-extrabold">{money(slip.toPay)}</dd>
        </dl>
        <Link href="/payroll/me" className={buttonClass("secondary", "md", "w-full")}>Подробный расчёт</Link>
      </div>
    </Card>
  );
}

async function MyTasks({ u }: { u: SessionUser }) {
  const db = await getDb();
  const rows = await q<{ id: number; title: string; due: string | null; priority: string; stage: string }>(db, sql`
    select t.id, t.title, t.due_at::text due, t.priority, st.name stage from tasks t join task_stages st on st.id = t.stage_id
    where t.deleted_at is null and t.assignee_id = ${u.id} and not st.is_done order by t.due_at nulls last, t.id desc limit 6`);
  const overdue = rows.filter((r) => r.due && new Date(r.due) < new Date()).length;
  return (
    <Card>
      <CardHeader title="Мои задачи" subtitle={overdue ? `${overdue} ${plural(overdue, "просрочена", "просрочены", "просрочено")}` : rows.length ? "в работе" : undefined} action={<Link href="/tasks" className={buttonClass("ghost", "sm")}>Доска <ArrowRight className="size-4" /></Link>} />
      {rows.length === 0 ? <EmptyState icon={<Kanban />} title="Задач нет" text="Можно выдохнуть ☕" /> : (
        <ul className="divide-y divide-line">
          {rows.map((t) => {
            const late = t.due && new Date(t.due) < new Date();
            return (
              <li key={t.id}>
                <Link href={`/tasks?open=${t.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                  <span className={`size-2 shrink-0 rounded-full ${t.priority === "urgent" ? "bg-danger" : t.priority === "high" ? "bg-warning" : "bg-line-strong"}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                  {t.due && <span className={`shrink-0 text-xs ${late ? "font-semibold text-danger" : "text-ink-3"}`}>{fmtDate(new Date(t.due), true).slice(0, 5)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

async function Debtors({ u }: { u: SessionUser }) {
  const db = await getDb();
  const s = await debtSummary(db, u);
  return (
    <Card>
      <CardHeader title="Долги клиентов" subtitle={`всего ${money(s.owedToUs)}`} action={<Link href="/payments?tab=debts" className={buttonClass("ghost", "sm")}>Все <ArrowRight className="size-4" /></Link>} />
      {s.debtors.length === 0 ? <EmptyState icon={<Wallet />} title="Долгов нет" /> : (
        <ul className="divide-y divide-line">
          {s.debtors.slice(0, 6).map((r) => (
            <li key={r.id}>
              <Link href={`/counterparties/${r.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{r.name}</span>{r.overdueDays > 0 && <span className={`text-xs ${r.overdueDays > 14 ? "text-danger" : "text-ink-3"}`}>{r.overdueDays} {plural(r.overdueDays, "день", "дня", "дней")}</span>}</span>
                <span className="tnum text-sm font-bold">{money(r.client_debt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {s.weOwe > 0 && <p className="border-t border-line px-4 py-3 text-xs text-ink-3 sm:px-5">Мы должны поставщикам: <b className="tnum text-ink">{money(s.weOwe)}</b></p>}
    </Card>
  );
}
