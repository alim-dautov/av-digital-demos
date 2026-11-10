import { and, asc, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { counterparties, leadEvents, leadStages, leads, tasks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, can, ForbiddenError, NotFoundError, ValidationError, type Principal } from "@/lib/rbac";
import { money } from "@/lib/format";
import { notify } from "@/modules/notifications/service";
import { createOrder } from "@/modules/orders/service";
import { emitWebhook } from "@/modules/webhooks/service";

export const leadInput = z.object({
  title: z.string().trim().min(1, "Укажите название").max(300),
  contactName: z.string().max(200).default(""),
  phone: z.string().max(40).nullable().optional(),
  source: z.string().max(100).default(""),
  amount: z.number().int().min(0).default(0),
  stageId: z.number().int().optional(),
  managerId: z.number().int().nullable().optional(),
  counterpartyId: z.number().int().nullable().optional(),
  segment: z.enum(["bazaar", "shop", "install", "other"]).default("other"),
  comment: z.string().max(5000).default(""),
  nextFollowUpAt: z.string().nullable().optional(),
});
export type LeadInput = z.infer<typeof leadInput>;

/** Руководитель продаж — владелец или полный доступ к команде */
const seesAll = (p: Principal) => p.isOwner || can(p, "team", "full");

export async function stages(db: DB) { return db.select().from(leadStages).orderBy(asc(leadStages.sort)); }

export async function board(db: DB, p: Principal, params: { managerId?: number; q?: string } = {}) {
  assertCan(p, "pipeline");
  const conds: (SQL | undefined)[] = [isNull(leads.deletedAt)];
  if (!seesAll(p)) conds.push(eq(leads.managerId, p.id));
  else if (params.managerId) conds.push(eq(leads.managerId, params.managerId));
  if (params.q) conds.push(sql`(lower(${leads.title}) like ${"%" + params.q.toLowerCase() + "%"} or lower(${leads.contactName}) like ${"%" + params.q.toLowerCase() + "%"})`);
  conds.push(sql`(${leadStages.kind} = 'open' or ${leads.lastActivityAt} > now() - interval '30 days')`);
  const rows = await db.select({
    id: leads.id, title: leads.title, contactName: leads.contactName, phone: leads.phone, source: leads.source, amount: leads.amount, stageId: leads.stageId,
    managerId: leads.managerId, managerName: users.name, managerColor: users.color, nextFollowUpAt: leads.nextFollowUpAt, lastActivityAt: leads.lastActivityAt,
    sort: leads.sort, orderId: leads.orderId, counterpartyId: leads.counterpartyId, stageKind: leadStages.kind, segment: leads.segment,
  }).from(leads).innerJoin(leadStages, eq(leadStages.id, leads.stageId)).leftJoin(users, eq(users.id, leads.managerId))
    .where(and(...conds)).orderBy(asc(leads.sort), desc(leads.id));
  return { stages: await stages(db), leads: rows };
}

export async function getLead(db: DB, p: Principal, id: number) {
  assertCan(p, "pipeline");
  const [l] = await db.select().from(leads).where(and(eq(leads.id, id), isNull(leads.deletedAt)));
  if (!l) throw new NotFoundError("Лид не найден");
  if (!seesAll(p) && l.managerId !== p.id) throw new ForbiddenError("Это лид другого менеджера");
  const events = await db.select({ id: leadEvents.id, type: leadEvents.type, text: leadEvents.text, createdAt: leadEvents.createdAt, userName: users.name })
    .from(leadEvents).leftJoin(users, eq(users.id, leadEvents.userId)).where(eq(leadEvents.leadId, id)).orderBy(desc(leadEvents.createdAt));
  const related = await db.select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, completedAt: tasks.completedAt }).from(tasks).where(and(eq(tasks.leadId, id), isNull(tasks.deletedAt)));
  return { ...l, events, tasks: related };
}

async function event(db: DB, leadId: number, userId: number | null, type: string, text: string) {
  await db.insert(leadEvents).values({ leadId, userId, type, text });
  await db.update(leads).set({ lastActivityAt: new Date(), staleNotifiedAt: null }).where(eq(leads.id, leadId));
}

export async function createLead(db: DB, p: Principal, input: LeadInput) {
  assertCan(p, "pipeline", "full");
  const st = input.stageId ?? (await stages(db))[0]?.id;
  if (!st) throw new ValidationError("Не настроены этапы воронки");
  const managerId = seesAll(p) ? (input.managerId ?? p.id) : p.id;
  const [l] = await db.insert(leads).values({ ...input, stageId: st, managerId, phone: input.phone ?? null, counterpartyId: input.counterpartyId ?? null,
    nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null, sort: -Date.now() / 1000 }).returning();
  await event(db, l.id, p.id, "created", "Лид создан");
  emitWebhook(db, "lead.created", { id: l.id, title: l.title, phone: l.phone, amount: l.amount, source: l.source });
  await audit(db, p, "create", "lead", l.id, `Лид «${l.title}» на ${money(l.amount)}`);
  await notify(db, [managerId], { type: "lead_new", title: `Новый лид: ${l.title}`, body: [l.contactName, l.phone].filter(Boolean).join(" · "), link: `/pipeline?open=${l.id}`, excludeUserId: p.id });
  return l;
}

export async function updateLead(db: DB, p: Principal, id: number, input: LeadInput) {
  const l0 = await getLead(db, p, id);
  assertCan(p, "pipeline", "full");
  const [l] = await db.update(leads).set({ ...input, stageId: input.stageId ?? l0.stageId, managerId: seesAll(p) ? (input.managerId ?? l0.managerId) : l0.managerId,
    phone: input.phone ?? null, counterpartyId: input.counterpartyId ?? null,
    nextFollowUpAt: input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null, followUpNotifiedAt: null }).where(eq(leads.id, id)).returning();
  await event(db, id, p.id, "update", "Лид изменён");
  if (l.managerId !== l0.managerId) await notify(db, [l.managerId], { type: "lead_new", title: `Вам передан лид: ${l.title}`, link: `/pipeline?open=${id}`, excludeUserId: p.id });
  return l;
}

export async function moveLead(db: DB, p: Principal, id: number, stageId: number, sort: number, lostReason?: string) {
  const l = await getLead(db, p, id);
  assertCan(p, "pipeline", "full");
  const [st] = await db.select().from(leadStages).where(eq(leadStages.id, stageId));
  if (!st) throw new ValidationError("Этап не найден");
  await db.update(leads).set({ stageId, sort, lostReason: st.kind === "lost" ? (lostReason ?? l.lostReason) : null }).where(eq(leads.id, id));
  if (stageId !== l.stageId) await event(db, id, p.id, "stage", `Этап: ${st.name}${st.kind === "lost" && lostReason ? ` (${lostReason})` : ""}`);
}

export async function commentLead(db: DB, p: Principal, id: number, text: string, type: "comment" | "call" = "comment") {
  await getLead(db, p, id);
  if (!text.trim()) throw new ValidationError("Пустой комментарий");
  await event(db, id, p.id, type, text.trim());
}

export async function deleteLead(db: DB, p: Principal, id: number) {
  const l = await getLead(db, p, id);
  assertCan(p, "pipeline", "full");
  await db.update(leads).set({ deletedAt: new Date() }).where(eq(leads.id, id));
  await audit(db, p, "delete", "lead", id, `Удалён лид «${l.title}»`);
}

/** Конвертация: лид → клиент (если нет) → заявка; лид переходит на этап «Заявка создана» */
export async function convertLead(db: DB, p: Principal, id: number) {
  const l = await getLead(db, p, id);
  assertCan(p, "counterparties", "full");
  assertCan(p, "orders", "full");
  if (l.orderId) throw new ValidationError("Заявка уже создана");
  let cpId = l.counterpartyId;
  if (!cpId) {
    const [cp] = await db.insert(counterparties).values({ kind: "client", name: l.contactName || l.title, phone: l.phone, whatsapp: l.phone, segment: l.segment, managerId: l.managerId, comment: `Из лида «${l.title}»` }).returning();
    cpId = cp.id;
  }
  const order = await createOrder(db, p, { counterpartyId: cpId, managerId: l.managerId, comment: `Из лида: ${l.title}${l.comment ? ". " + l.comment : ""}`, source: "lead", leadId: id, items: [], discountPct: 0 });
  const st = (await stages(db)).find((s) => /заявк/i.test(s.name)) ?? (await stages(db)).find((s) => s.kind === "won");
  await db.update(leads).set({ counterpartyId: cpId, orderId: order.id, ...(st ? { stageId: st.id } : {}) }).where(eq(leads.id, id));
  await event(db, id, p.id, "converted", `Создан клиент и заявка №${order.number}`);
  return { orderId: order.id, counterpartyId: cpId };
}
