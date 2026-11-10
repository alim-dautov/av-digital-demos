import Link from "next/link";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { addDays, money, pct, today } from "@/lib/format";
import { Avatar, Badge, Card, CardHeader, PageHeader, Progress } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { activeUsers } from "@/modules/counterparties/service";
import { taskStats } from "@/modules/tasks/service";
import { managersVsPlan } from "@/modules/analytics/service";

export const metadata = { title: "Команда" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireUser("team");
  const sp = await searchParams;
  const db = await getDb();
  const days = sp.p === "90" ? 90 : sp.p === "7" ? 7 : 30;
  const from = addDays(today(), -(days - 1)), to = today();
  const people = await activeUsers(db);
  const stats = await taskStats(db, from, to);
  const plan = can(u, "analytics") ? await managersVsPlan(db, u) : null;
  return (
    <>
      <PageHeader title="Команда" subtitle="выполнение задач и план продаж по сотрудникам" />
      <Tabs active={String(days)} items={[{ key: "7", label: "7 дней", href: "/team?p=7" }, { key: "30", label: "30 дней", href: "/team" }, { key: "90", label: "90 дней", href: "/team?p=90" }]} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {people.map((p) => {
          const s = stats.find((x) => x.user_id === p.id);
          const onTime = s?.with_due ? (s.on_time / s.with_due) * 100 : null;
          const pl = plan?.rows.find((r) => r.id === p.id);
          return (
            <Card key={p.id} className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} color={p.color} size={44} />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{p.name}</p><p className="truncate text-xs text-ink-3">{p.position || "—"}</p></div>
                {p.isSalesManager && <Badge tone="info">продажи</Badge>}{p.isAssembler && <Badge tone="neutral">сборка</Badge>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Link href={`/tasks?who=${p.id}`} className="rounded-xl bg-surface-2 p-2 hover:bg-line"><p className="tnum text-lg font-extrabold">{s?.open ?? 0}</p><p className="text-[11px] text-ink-3">в работе</p></Link>
                <div className="rounded-xl bg-surface-2 p-2"><p className={`tnum text-lg font-extrabold ${s?.overdue ? "text-danger" : ""}`}>{s?.overdue ?? 0}</p><p className="text-[11px] text-ink-3">просрочено</p></div>
                <div className="rounded-xl bg-surface-2 p-2"><p className="tnum text-lg font-extrabold">{s?.done ?? 0}</p><p className="text-[11px] text-ink-3">выполнено</p></div>
              </div>
              <div className="flex justify-between text-xs text-ink-3">
                <span>В срок: <b className="text-ink">{onTime == null ? "—" : pct(onTime)}</b></span>
                <span>Среднее время: <b className="text-ink">{s?.avg_hours ? `${Math.round(Number(s.avg_hours))} ч` : "—"}</b></span>
              </div>
              {pl && pl.plan > 0 && (
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-ink-3">План недели</span><span className="tnum font-semibold">{money(pl.revenue)} / {money(pl.plan)}</span></div>
                  <Progress value={Math.min(100, pl.pct)} tone={pl.pct >= 100 ? "success" : pl.pct >= 60 ? "yellow" : "danger"} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {plan && (
        <Card className="mt-5">
          <CardHeader title="Заявки менеджеров за неделю" />
          <ul className="divide-y divide-line">{plan.rows.map((r) => <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm sm:px-5"><span>{r.name}</span><span className="tnum">{r.orders} заявок · {money(r.revenue)}</span></li>)}</ul>
        </Card>
      )}
    </>
  );
}
