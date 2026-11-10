import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { taskComments, taskStages, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, can, ForbiddenError, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { notify } from "@/modules/notifications/service";
import { emitWebhook } from "@/modules/webhooks/service";

const fileRef = z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() });

export const taskInput = z.object({
  title: z.string().trim().min(1, "Укажите название").max(300),
  description: z.string().max(10000).default(""),
  assigneeId: z.number().int(),
  stageId: z.number().int().optional(),
  dueAt: z.string().nullable().optional(), // ISO
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  tags: z.array(z.string().trim().min(1).max(30)).default([]),
  orderId: z.number().int().nullable().optional(),
  counterpartyId: z.number().int().nullable().optional(),
  leadId: z.number().int().nullable().optional(),
  attachments: z.array(fileRef).default([]),
});
export type TaskInput = z.infer<typeof taskInput>;

export const PRIORITIES = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочно" } as const;

/** Руководитель видит все задачи; остальные — только где ответственный или постановщик */
export const seesAll = (p: Principal) => p.isOwner || can(p, "team", "full");

function visibility(p: Principal): SQL | undefined {
  if (seesAll(p)) return undefined;
  return sql`(${tasks.assigneeId} = ${p.id} or ${tasks.creatorId} = ${p.id})`;
}

export async function stages(db: DB) { return db.select().from(taskStages).orderBy(asc(taskStages.sort)); }

export async function board(db: DB, p: Principal, params: { assigneeId?: number; q?: string; tag?: string; mine?: boolean } = {}) {
  assertCan(p, "tasks");
  const conds: (SQL | undefined)[] = [isNull(tasks.deletedAt), visibility(p)];
  // «Мои» — только где ответственный; без фильтра сотрудник видит свои и поставленные им (visibility)
  if (params.mine) conds.push(eq(tasks.assigneeId, p.id));
  else if (params.assigneeId) conds.push(eq(tasks.assigneeId, params.assigneeId));
  if (params.q) conds.push(sql`lower(${tasks.title}) like ${"%" + params.q.toLowerCase() + "%"}`);
  if (params.tag) conds.push(sql`${tasks.tags} @> ${JSON.stringify([params.tag])}::jsonb`);
  // скрываем выполненные старше 14 дней
  conds.push(sql`(${tasks.completedAt} is null or ${tasks.completedAt} > now() - interval '14 days')`);
  const rows = await db.select({
    id: tasks.id, title: tasks.title, stageId: tasks.stageId, assigneeId: tasks.assigneeId, creatorId: tasks.creatorId, dueAt: tasks.dueAt, priority: tasks.priority,
    tags: tasks.tags, sort: tasks.sort, commentsCount: tasks.commentsCount, completedAt: tasks.completedAt, orderId: tasks.orderId, counterpartyId: tasks.counterpartyId, leadId: tasks.leadId,
    assigneeName: users.name, assigneeColor: users.color, attachmentsCount: sql<number>`jsonb_array_length(${tasks.attachments})`,
  }).from(tasks).innerJoin(users, eq(users.id, tasks.assigneeId)).where(and(...conds)).orderBy(asc(tasks.sort), desc(tasks.id));
  return { stages: await stages(db), tasks: rows };
}

export async function getTask(db: DB, p: Principal, id: number) {
  assertCan(p, "tasks");
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
  if (!t) throw new NotFoundError("Задача не найдена");
  if (!seesAll(p) && t.assigneeId !== p.id && t.creatorId !== p.id) throw new ForbiddenError("Это чужая задача");
  const comments = await db.select({ id: taskComments.id, body: taskComments.body, createdAt: taskComments.createdAt, authorId: taskComments.authorId, authorName: users.name,
    authorColor: users.color, attachments: taskComments.attachments }).from(taskComments).innerJoin(users, eq(users.id, taskComments.authorId))
    .where(eq(taskComments.taskId, id)).orderBy(asc(taskComments.createdAt));
  const ppl = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [t.assigneeId, t.creatorId]));
  return { ...t, comments, assigneeName: ppl.find((x) => x.id === t.assigneeId)?.name ?? "", creatorName: ppl.find((x) => x.id === t.creatorId)?.name ?? "" };
}

export async function createTask(db: DB, p: Principal, input: TaskInput) {
  assertCan(p, "tasks", "full");
  if (!seesAll(p) && input.assigneeId !== p.id && !p.isSalesManager && !can(p, "tasks", "full")) throw new ForbiddenError();
  const st = input.stageId ? input.stageId : (await stages(db))[0]?.id;
  if (!st) throw new ValidationError("Не настроены этапы задач");
  const [{ m }] = await db.select({ m: sql<number>`coalesce(min(${tasks.sort}), 0)` }).from(tasks).where(eq(tasks.stageId, st));
  const [t] = await db.insert(tasks).values({
    ...input, stageId: st, creatorId: p.id, dueAt: input.dueAt ? new Date(input.dueAt) : null, sort: Number(m) - 1,
    orderId: input.orderId ?? null, counterpartyId: input.counterpartyId ?? null, leadId: input.leadId ?? null,
  }).returning();
  await audit(db, p, "create", "task", t.id, `Задача «${t.title}»`);
  emitWebhook(db, "task.created", { id: t.id, title: t.title, assigneeId: t.assigneeId, dueAt: t.dueAt });
  await notify(db, [t.assigneeId], { type: "task_new", title: `Новая задача: ${t.title}`, body: `Поставил: ${p.name}`, link: `/tasks?open=${t.id}`, excludeUserId: p.id });
  return t;
}

export async function updateTask(db: DB, p: Principal, id: number, input: TaskInput) {
  const t0 = await getTask(db, p, id);
  assertCan(p, "tasks", "full");
  const [t] = await db.update(tasks).set({
    ...input, stageId: input.stageId ?? t0.stageId, dueAt: input.dueAt ? new Date(input.dueAt) : null, updatedAt: new Date(),
    orderId: input.orderId ?? null, counterpartyId: input.counterpartyId ?? null, leadId: input.leadId ?? null,
    ...(input.dueAt && t0.dueAt?.toISOString() !== new Date(input.dueAt).toISOString() ? { dueNotifiedAt: null, overdueNotifiedAt: null } : {}),
  }).where(eq(tasks.id, id)).returning();
  if (t.assigneeId !== t0.assigneeId) await notify(db, [t.assigneeId], { type: "task_new", title: `Вам передана задача: ${t.title}`, body: `От: ${p.name}`, link: `/tasks?open=${t.id}`, excludeUserId: p.id });
  await audit(db, p, "update", "task", id, `Изменена задача «${t.title}»`);
  return t;
}

/** Перемещение карточки (drag-and-drop): смена этапа и позиции */
export async function moveTask(db: DB, p: Principal, id: number, stageId: number, sort: number) {
  const t0 = await getTask(db, p, id);
  assertCan(p, "tasks", "full");
  const [st] = await db.select().from(taskStages).where(eq(taskStages.id, stageId));
  if (!st) throw new ValidationError("Этап не найден");
  await db.update(tasks).set({ stageId, sort, completedAt: st.isDone ? (t0.completedAt ?? new Date()) : null, updatedAt: new Date() }).where(eq(tasks.id, id));
  if (stageId !== t0.stageId) {
    await audit(db, p, "status", "task", id, `Задача «${t0.title}» → ${st.name}`);
    await notify(db, [t0.assigneeId, t0.creatorId], { type: "task_status", title: `${t0.title}: ${st.name}`, body: `Изменил: ${p.name}`, link: `/tasks?open=${id}`, excludeUserId: p.id });
  }
}

export async function deleteTask(db: DB, p: Principal, id: number) {
  const t = await getTask(db, p, id);
  assertCan(p, "tasks", "full");
  if (!seesAll(p) && t.creatorId !== p.id) throw new ForbiddenError("Удалить может постановщик или руководитель");
  await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  await audit(db, p, "delete", "task", id, `Удалена задача «${t.title}»`);
}

/** Упоминания @Имя → id пользователей */
export function parseMentions(body: string, people: { id: number; name: string }[]) {
  const res = new Set<number>();
  const lower = body.toLowerCase();
  for (const u of people) {
    const first = u.name.split(/\s+/)[0].toLowerCase();
    if (lower.includes("@" + u.name.toLowerCase()) || new RegExp(`@${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(lower)) res.add(u.id);
  }
  return [...res];
}

export async function addComment(db: DB, p: Principal, taskId: number, body: string, attachments: z.infer<typeof fileRef>[] = []) {
  const t = await getTask(db, p, taskId);
  if (!body.trim() && !attachments.length) throw new ValidationError("Пустой комментарий");
  const people = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true));
  const mentions = parseMentions(body, people);
  const [c] = await db.insert(taskComments).values({ taskId, authorId: p.id, body: body.trim(), mentions, attachments }).returning();
  await db.update(tasks).set({ commentsCount: sql`${tasks.commentsCount} + 1`, updatedAt: new Date() }).where(eq(tasks.id, taskId));
  await notify(db, [t.assigneeId, t.creatorId, ...mentions], {
    type: "task_comment", title: `${p.name} в задаче «${t.title}»`, body: body.slice(0, 140), link: `/tasks?open=${taskId}`, excludeUserId: p.id,
  });
  return c;
}

/** Статистика выполнения для аналитики/команды */
export async function taskStats(db: DB, from: string, to: string) {
  const rows = await db.execute(sql`
    select t.assignee_id as user_id,
      count(*) filter (where t.completed_at is null)::int as open,
      count(*) filter (where t.completed_at is null and t.due_at < now())::int as overdue,
      count(*) filter (where (t.completed_at at time zone 'Asia/Almaty')::date between ${from} and ${to})::int as done,
      count(*) filter (where (t.completed_at at time zone 'Asia/Almaty')::date between ${from} and ${to} and t.due_at is not null and t.completed_at <= t.due_at)::int as on_time,
      count(*) filter (where (t.completed_at at time zone 'Asia/Almaty')::date between ${from} and ${to} and t.due_at is not null)::int as with_due,
      coalesce(avg(extract(epoch from (t.completed_at - t.created_at)) / 3600) filter (where (t.completed_at at time zone 'Asia/Almaty')::date between ${from} and ${to}), 0)::float8 as avg_hours
    from tasks t where t.deleted_at is null group by t.assignee_id`);
  return ((rows as unknown as { rows: unknown[] }).rows ?? rows) as { user_id: number; open: number; overdue: number; done: number; on_time: number; with_due: number; avg_hours: number }[];
}
