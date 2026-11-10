import { Suspense } from "react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { money } from "@/lib/format";
import { PageHeader, Skeleton, Stat } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { board } from "@/modules/leads/service";
import { salesManagers } from "@/modules/counterparties/service";
import { getSetting } from "@/modules/settings/store";
import { LeadBoard } from "./_components/lead-board";

export const metadata = { title: "Воронка" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ m?: string; q?: string }> }) {
  const u = await requireUser("pipeline");
  const sp = await searchParams;
  const db = await getDb();
  const all = u.isOwner || can(u, "team", "full");
  const b = await board(db, u, { managerId: sp.m ? Number(sp.m) : undefined, q: sp.q });
  const managers = await salesManagers(db);
  const { staleDays } = await getSetting(db, "leads");
  const kind = new Map(b.stages.map((s) => [s.id, s.kind]));
  const open = b.leads.filter((l) => kind.get(l.stageId) === "open");
  const won = b.leads.filter((l) => kind.get(l.stageId) === "won");
  const stale = open.filter((l) => Date.now() - l.lastActivityAt.getTime() > staleDays * 86400000).length;
  return (
    <>
      <PageHeader title="Воронка продаж" subtitle={`лиды без движения больше ${staleDays} дн. подсвечены — менеджер получит напоминание`} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Stat label="В работе" value={`${open.length} · ${money(open.reduce((s, l) => s + l.amount, 0))}`} />
        <Stat label="Выиграно (30 дн.)" value={String(won.length)} tone="up" />
        <Stat label="Зависли" value={String(stale)} tone={stale ? "warn" : undefined} />
      </div>
      {all && <Tabs active={sp.m ?? "all"} items={[{ key: "all", label: "Все", href: "/pipeline" }, ...managers.map((m) => ({ key: String(m.id), label: m.name.split(" ")[0], href: `/pipeline?m=${m.id}` }))]} />}
      <Suspense fallback={<Skeleton className="h-96" />}>
        <LeadBoard canEdit={can(u, "pipeline", "full")} staleDays={staleDays} managerAll={all} people={managers}
          stages={b.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, kind: s.kind }))}
          leads={b.leads.map((l) => ({ ...l, nextFollowUpAt: l.nextFollowUpAt?.toISOString() ?? null, lastActivityAt: l.lastActivityAt.toISOString() }))} />
      </Suspense>
    </>
  );
}
