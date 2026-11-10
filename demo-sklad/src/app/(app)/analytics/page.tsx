import Link from "next/link";
import { FileDown, FileSpreadsheet, Info } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { flag } from "@/lib/rbac";
import { addDays, fmtDate, money, pct, today } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/labels";
import { Card, CardHeader, Input, PageHeader, Stat, buttonClass, cn } from "@/components/ui";
import { DataTable, Tabs } from "@/components/ui/table";
import { BarsChart, DonutChart, PlanChart } from "@/components/charts-lazy";
import { RevenueChart } from "@/components/area-chart";
import { bySegment, defaultRange, kpis, managersVsPlan, marginBy, taskPerformance } from "@/modules/analytics/service";
import { DIMS, type Dim } from "@/modules/analytics/reports";

export const metadata = { title: "Аналитика" };
type SP = { tab?: string; from?: string; to?: string; dim?: string };
const D = /^\d{4}-\d{2}-\d{2}$/;

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("analytics");
  const sp = await searchParams;
  const db = await getDb();
  const rg = defaultRange();
  const from = sp.from && D.test(sp.from) ? sp.from : rg.from, to = sp.to && D.test(sp.to) ? sp.to : rg.to;
  const tab = sp.tab ?? "overview";
  const dim = (sp.dim && sp.dim in DIMS ? sp.dim : "client") as Dim;
  const profit = flag(u, "seeProfit");
  const qs = (o: Partial<SP>) => `/analytics?${new URLSearchParams(Object.entries({ ...sp, from, to, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const report = { overview: "sales", margin: "margin", segments: "segments", managers: "managers", tasks: "tasks" }[tab] ?? "sales";
  const exp = (fmt: string) => `/api/analytics/export?${new URLSearchParams({ report, dim, from, to, format: fmt })}`;
  const presets = [["7 дней", 6], ["30 дней", 29], ["90 дней", 89], ["Год", 364]] as const;
  return (
    <>
      <PageHeader title="Аналитика" subtitle={`${fmtDate(from)} – ${fmtDate(to)}`}
        actions={<>
          <a href={exp("xlsx")} className={buttonClass("secondary")}><FileSpreadsheet className="size-4" />Excel</a>
          <a href={exp("pdf")} target="_blank" rel="noreferrer" className={buttonClass("ghost")}><FileDown className="size-4" />PDF</a>
        </>} />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="/analytics">
        <input type="hidden" name="tab" value={tab} />{tab === "margin" && <input type="hidden" name="dim" value={dim} />}
        <Input type="date" name="from" defaultValue={from} className="max-w-40" aria-label="С" /><Input type="date" name="to" defaultValue={to} className="max-w-40" aria-label="По" />
        <button className={buttonClass("secondary")}>Показать</button>
        <div className="flex flex-wrap gap-1">{presets.map(([l, n]) => <Link key={l} href={qs({ from: addDays(today(), -n), to: today() })} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:bg-surface-2">{l}</Link>)}</div>
      </form>
      <Tabs active={tab} items={[
        { key: "overview", label: "Обзор", href: qs({ tab: "overview" }) }, { key: "margin", label: "Маржа", href: qs({ tab: "margin" }) },
        { key: "segments", label: "Сегменты", href: qs({ tab: "segments" }) }, { key: "managers", label: "Менеджеры", href: qs({ tab: "managers" }) },
        { key: "tasks", label: "Задачи", href: qs({ tab: "tasks" }) },
      ]} />
      {tab === "overview" && await Overview()}
      {tab === "margin" && await Margin()}
      {tab === "segments" && await Segments()}
      {tab === "managers" && await Managers()}
      {tab === "tasks" && await Tasks()}
    </>
  );

  async function Overview() {
    const k = await kpis(db, u, from, to);
    return (
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <Stat label="Выручка" value={money(k.revenue)} />
          {profit && <Stat label="Валовая прибыль" value={money(k.profit)} hint={k.marginPct != null ? `маржа ${pct(k.marginPct)}` : undefined} />}
          <Stat label="Заявок" value={String(k.orders)} hint={`на ${money(k.ordersSum)}`} />
          <Stat label="Средний чек" value={money(k.avgCheck)} />
          <Stat label="Конверсия лидов" value={pct(k.conversionPct)} />
        </div>
        <Card><CardHeader title="Выручка и прибыль" /><div className="px-2 py-4"><RevenueChart data={k.series.map((x) => ({ d: fmtDate(x.d).slice(0, 5), revenue: x.revenue, profit: x.profit }))} /></div></Card>
        <Card>
          <CardHeader title="Воронка лидов" subtitle="созданные за период, по текущему этапу" />
          <div className="px-2 py-4"><BarsChart data={k.funnel.map((f) => ({ name: f.name, c: f.c }))} keys={[{ key: "c", name: "Лидов" }]} height={220} count /></div>
          <p className="px-5 pb-4 text-xs text-ink-3">{k.funnel.map((f) => `${f.name}: ${f.c}`).join(" · ")}</p>
        </Card>
      </div>
    );
  }

  async function Margin() {
    const rows = await marginBy(db, u, dim, from, to, 200);
    const estimated = rows.some((r) => r.estimated);
    type R = (typeof rows)[number];
    return (
      <Card className="overflow-hidden">
        <div className="scroll-thin flex gap-1.5 overflow-x-auto border-b border-line p-3 sm:px-4">
          {(Object.keys(DIMS) as Dim[]).map((d) => <Link key={d} href={qs({ dim: d })} className={cn("shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold", d === dim ? "border-yellow bg-yellow/15" : "border-line")}>{DIMS[d]}</Link>)}
        </div>
        <DataTable<R> rows={rows} rowKey={(r) => r.id} rowHref={dim === "client" ? (r) => `/counterparties/${r.id}` : dim === "product" ? (r) => `/products/${r.id}` : dim === "shipment" ? (r) => `/shipments/${r.id}` : undefined}
          columns={[
            { key: "n", header: "Наименование", cell: (r) => <span className="block max-w-[360px] truncate">{r.name}{r.estimated > 0 && <span className="ml-1 text-warning" title="есть строки с расчётной себестоимостью">*</span>}</span> },
            { key: "r", header: "Выручка", align: "right", cell: (r) => money(r.revenue) },
            ...(profit ? [
              { key: "c", header: "Себестоимость", align: "right" as const, cell: (r: R) => money(r.cost), hideMd: true },
              { key: "p", header: "Прибыль", align: "right" as const, cell: (r: R) => <b className={(r.profit ?? 0) < 0 ? "text-danger" : ""}>{money(r.profit)}</b> },
              { key: "m", header: "Маржа", align: "right" as const, cell: (r: R) => r.marginPct == null ? "—" : <span className={r.marginPct < 0 ? "text-danger" : r.marginPct < 10 ? "text-warning" : "text-success"}>{pct(r.marginPct)}</span> },
            ] : []),
          ]}
          mobile={(r) => <div className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold">{r.name}</span><span className="tnum shrink-0 text-right">{money(r.revenue)}{r.marginPct != null && <span className="block text-xs text-ink-3">{pct(r.marginPct)}</span>}</span></div>} />
        {estimated && profit && <p className="flex gap-2 border-t border-line px-4 py-3 text-xs text-ink-3"><Info className="size-4 shrink-0" />* себестоимость расчётная: в отгрузке не было закупки, взята последняя приёмка или закупочная цена карточки</p>}
        {!profit && <p className="border-t border-line px-4 py-3 text-xs text-ink-3">Прибыль и маржа скрыты — нет права «Видеть прибыль»</p>}
      </Card>
    );
  }

  async function Segments() {
    const rows = await bySegment(db, u, from, to);
    const name = (s: string) => SEGMENT_LABELS[s as keyof typeof SEGMENT_LABELS] ?? s;
    return (
      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card><CardHeader title="Доля выручки" /><div className="p-4"><DonutChart data={rows.map((r) => ({ name: name(r.segment), value: r.revenue }))} /></div></Card>
        <Card className="overflow-hidden">
          <DataTable rows={rows} rowKey={(r) => r.segment}
            columns={[
              { key: "s", header: "Сегмент", cell: (r) => <b>{name(r.segment)}</b> },
              { key: "o", header: "Отгрузок", align: "right", cell: (r) => r.orders },
              { key: "r", header: "Выручка", align: "right", cell: (r) => money(r.revenue) },
              ...(profit ? [{ key: "p", header: "Прибыль", align: "right" as const, cell: (r: (typeof rows)[number]) => money(r.profit) }] : []),
            ]}
            mobile={(r) => <div className="flex justify-between text-sm"><b>{name(r.segment)}</b><span className="tnum">{money(r.revenue)}</span></div>} />
        </Card>
      </div>
    );
  }

  async function Managers() {
    const m = await managersVsPlan(db, u, to);
    return (
      <div className="flex flex-col gap-5">
        <Card><CardHeader title="План недели" subtitle={`${fmtDate(m.start)} – ${fmtDate(m.end)}`} /><div className="px-2 py-4"><PlanChart data={m.rows.map((r) => ({ name: r.name.split(" ")[0], revenue: r.revenue, plan: r.plan }))} /></div></Card>
        <Card className="overflow-hidden">
          <DataTable rows={m.rows} rowKey={(r) => r.id}
            columns={[
              { key: "n", header: "Менеджер", cell: (r) => <b>{r.name}</b> }, { key: "o", header: "Заявок", align: "right", cell: (r) => r.orders },
              { key: "r", header: "Выручка", align: "right", cell: (r) => money(r.revenue) }, { key: "p", header: "План", align: "right", cell: (r) => (r.plan ? money(r.plan) : "—") },
              { key: "x", header: "Выполнение", align: "right", cell: (r) => (r.plan ? <b className={r.pct >= 100 ? "text-success" : r.pct >= 60 ? "text-warning" : "text-danger"}>{pct(r.pct)}</b> : "—") },
            ]}
            mobile={(r) => <div className="flex justify-between text-sm"><b>{r.name}</b><span className="tnum">{money(r.revenue)}{r.plan ? ` · ${pct(r.pct)}` : ""}</span></div>} />
        </Card>
      </div>
    );
  }

  async function Tasks() {
    const rows = await taskPerformance(db, u, from, to);
    return (
      <Card className="overflow-hidden">
        <DataTable rows={rows} rowKey={(r) => r.id}
          columns={[
            { key: "n", header: "Сотрудник", cell: (r) => <b>{r.name}</b> }, { key: "o", header: "В работе", align: "right", cell: (r) => r.open },
            { key: "x", header: "Просрочено", align: "right", cell: (r) => <span className={r.overdue ? "font-bold text-danger" : ""}>{r.overdue}</span> },
            { key: "d", header: "Выполнено", align: "right", cell: (r) => r.done }, { key: "t", header: "В срок", align: "right", cell: (r) => (r.onTimePct == null ? "—" : pct(r.onTimePct)) },
            { key: "h", header: "Среднее время", align: "right", cell: (r) => (r.avgHours ? `${Math.round(r.avgHours)} ч` : "—"), hideMd: true },
          ]}
          mobile={(r) => <div className="flex justify-between text-sm"><b>{r.name}</b><span>{r.done} вып. · {r.overdue} просроч.</span></div>} />
      </Card>
    );
  }
}
