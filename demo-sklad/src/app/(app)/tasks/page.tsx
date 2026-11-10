import { Suspense } from "react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader, Skeleton } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { board, seesAll } from "@/modules/tasks/service";
import { activeUsers } from "@/modules/counterparties/service";
import { TaskBoard } from "./_components/task-board";

export const metadata = { title: "Задачи" };
type SP = { who?: string; q?: string; tag?: string };

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("tasks");
  const sp = await searchParams;
  const db = await getDb();
  const all = seesAll(u);
  const who = sp.who ?? "mine";
  const b = await board(db, u, { mine: who === "mine", assigneeId: who !== "mine" && who !== "all" ? Number(who) : undefined, q: sp.q, tag: sp.tag });
  const people = (await activeUsers(db)).map((x) => ({ id: x.id, name: x.name }));
  const href = (w: string) => `/tasks?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), who: w })}`;
  const tabs = [{ key: "mine", label: "Мои", href: href("mine") }, { key: "all", label: all ? "Все" : "Мои и поставленные", href: href("all") }, ...(all ? people.filter((p) => p.id !== u.id).map((p) => ({ key: String(p.id), label: p.name.split(" ")[0], href: href(String(p.id)) })) : [])];
  return (
    <>
      <PageHeader title="Задачи" subtitle="перетаскивайте карточки между этапами; на телефоне — за ручку справа или долгим нажатием" />
      <Tabs active={who} items={tabs} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <TaskBoard me={u.id} canEdit={can(u, "tasks", "full")} people={people}
          stages={b.stages.map((s) => ({ id: s.id, name: s.name, color: s.color, isDone: s.isDone }))}
          tasks={b.tasks.map((t) => ({ ...t, dueAt: t.dueAt ? t.dueAt.toISOString() : null, completedAt: t.completedAt ? t.completedAt.toISOString() : null, tags: t.tags ?? [] }))} />
      </Suspense>
    </>
  );
}
