/**
 * Периодические проверки: приближение/просрочка сроков задач, зависшие лиды, напоминания follow-up.
 * Запускается из instrumentation.ts каждые 5 минут и вручную через POST /api/cron.
 */
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { leadStages, leads, taskStages, tasks } from "@/db/schema";
import { notify } from "@/modules/notifications/service";
import { getSetting } from "@/modules/settings/store";
import { fmtDate } from "@/lib/format";

export async function runChecks(db: DB) {
  // PGlite без autovacuum: раз в 6 часов обновляем статистику планировщика (см. analyzeIfStale)
  await (await import("@/db")).analyzeIfStale();
  const taskCfg = await getSetting(db, "tasks");
  const leadCfg = await getSetting(db, "leads");
  const soon = new Date(Date.now() + taskCfg.dueSoonHours * 3600000);
  const open = sql`${tasks.stageId} not in (select id from ${taskStages} where is_done)`;

  const dueSoon = await db.select().from(tasks).where(and(isNull(tasks.deletedAt), isNull(tasks.completedAt), isNull(tasks.dueNotifiedAt), lt(tasks.dueAt, soon), sql`${tasks.dueAt} > now()`, open));
  for (const t of dueSoon) {
    await notify(db, [t.assigneeId], { type: "task_due", title: `Скоро срок: ${t.title}`, body: `До ${fmtDate(t.dueAt, true)}`, link: `/tasks?open=${t.id}` });
    await db.update(tasks).set({ dueNotifiedAt: new Date() }).where(eq(tasks.id, t.id));
  }
  const overdue = await db.select().from(tasks).where(and(isNull(tasks.deletedAt), isNull(tasks.completedAt), isNull(tasks.overdueNotifiedAt), lt(tasks.dueAt, new Date()), open));
  for (const t of overdue) {
    await notify(db, [t.assigneeId, t.creatorId], { type: "task_overdue", title: `Просрочена задача: ${t.title}`, body: `Срок был ${fmtDate(t.dueAt, true)}`, link: `/tasks?open=${t.id}` });
    await db.update(tasks).set({ overdueNotifiedAt: new Date() }).where(eq(tasks.id, t.id));
  }

  const openLead = sql`${leads.stageId} in (select id from ${leadStages} where kind = 'open')`;
  const stale = await db.select().from(leads).where(and(isNull(leads.deletedAt), isNull(leads.staleNotifiedAt), openLead,
    lt(leads.lastActivityAt, new Date(Date.now() - leadCfg.staleDays * 86400000))));
  for (const l of stale) {
    await notify(db, [l.managerId], { type: "lead_stale", title: `Лид завис: ${l.title}`, body: `Нет активности больше ${leadCfg.staleDays} дн.`, link: `/pipeline?open=${l.id}` });
    await db.update(leads).set({ staleNotifiedAt: new Date() }).where(eq(leads.id, l.id));
  }
  const follow = await db.select().from(leads).where(and(isNull(leads.deletedAt), isNull(leads.followUpNotifiedAt), openLead, lt(leads.nextFollowUpAt, new Date())));
  for (const l of follow) {
    await notify(db, [l.managerId], { type: "lead_followup", title: `Связаться: ${l.title}`, body: [l.contactName, l.phone].filter(Boolean).join(" · "), link: `/pipeline?open=${l.id}` });
    await db.update(leads).set({ followUpNotifiedAt: new Date() }).where(eq(leads.id, l.id));
  }
  return { dueSoon: dueSoon.length, overdue: overdue.length, stale: stale.length, followUps: follow.length };
}
