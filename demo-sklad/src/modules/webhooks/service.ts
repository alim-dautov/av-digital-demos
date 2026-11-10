import { createHmac, randomBytes } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { webhooks } from "@/db/schema";
import { audit } from "@/lib/audit";
import { ForbiddenError, NotFoundError, type Principal } from "@/lib/rbac";

/** События, на которые можно подписать вебхук */
export const WEBHOOK_EVENTS = {
  "order.created": "Заявка создана",
  "order.status": "Заявка сменила статус",
  "shipment.posted": "Отгрузка проведена",
  "payment.created": "Поступила / проведена оплата",
  "receipt.posted": "Приёмка проведена",
  "lead.created": "Новый лид",
  "task.created": "Новая задача",
  "stock.negative": "Отрицательный остаток",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
const EVENT_KEYS = Object.keys(WEBHOOK_EVENTS) as [WebhookEvent, ...WebhookEvent[]];

const assertOwner = (p: Principal) => { if (!p.isOwner || p.tokenId) throw new ForbiddenError("Только владелец"); };

export const webhookInput = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1).max(100),
  url: z.string().trim().url().max(500).refine((u) => /^https?:\/\//.test(u), "Только http(s)"),
  events: z.array(z.enum(EVENT_KEYS)).min(1, "Выберите хотя бы одно событие"),
  active: z.boolean().default(true),
});

export async function listWebhooks(db: DB, p: Principal) {
  assertOwner(p);
  return db.select().from(webhooks).orderBy(desc(webhooks.id));
}

export async function saveWebhook(db: DB, p: Principal, i: z.infer<typeof webhookInput>) {
  assertOwner(p);
  if (i.id) {
    const r = await db.update(webhooks).set({ name: i.name, url: i.url, events: i.events, active: i.active }).where(eq(webhooks.id, i.id)).returning();
    if (!r.length) throw new NotFoundError();
    await audit(db, p, "update", "webhook", i.id, `Изменён вебхук «${i.name}»`);
    return { id: i.id, secret: null as string | null };
  }
  const secret = "whsec_" + randomBytes(18).toString("base64url");
  const [w] = await db.insert(webhooks).values({ name: i.name, url: i.url, events: i.events, active: i.active, secret }).returning();
  await audit(db, p, "create", "webhook", w.id, `Создан вебхук «${i.name}»`);
  return { id: w.id, secret };
}

export async function deleteWebhook(db: DB, p: Principal, id: number) {
  assertOwner(p);
  await db.delete(webhooks).where(eq(webhooks.id, id));
  await audit(db, p, "delete", "webhook", id, "Удалён вебхук");
}

export const signBody = (secret: string, ts: number, body: string) => createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

async function deliver(db: DB, w: typeof webhooks.$inferSelect, event: string, data: unknown) {
  if (process.env.DEMO_MODE === "1") return 0; // демо: наружу ничего не отправляем
  const body = JSON.stringify({ event, data, sentAt: new Date().toISOString() });
  const ts = Math.floor(Date.now() / 1000);
  let status = 0;
  try {
    const r = await fetch(w.url, {
      method: "POST", body, signal: AbortSignal.timeout(8000),
      headers: { "content-type": "application/json", "user-agent": "DEMO-CRM-Webhook/1.0", "x-demo-event": event, "x-demo-timestamp": String(ts), "x-demo-signature": `sha256=${signBody(w.secret, ts, body)}` },
    });
    status = r.status;
  } catch { status = 0; }
  await db.update(webhooks).set({ lastStatus: status, lastCalledAt: new Date() }).where(eq(webhooks.id, w.id));
  return status;
}

/** Отправить событие подписанным вебхукам. Не бросает исключений и не блокирует вызывающий код. */
export function emitWebhook(db: DB, event: WebhookEvent, data: unknown) {
  void (async () => {
    try {
      const rows = await db.select().from(webhooks).where(eq(webhooks.active, true));
      await Promise.all(rows.filter((w) => w.events.includes(event)).map((w) => deliver(db, w, event, data)));
    } catch { /* вебхуки не должны ломать бизнес-операции */ }
  })();
}

export async function testWebhook(db: DB, p: Principal, id: number) {
  assertOwner(p);
  const [w] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  if (!w) throw new NotFoundError();
  return deliver(db, w, "ping", { message: "Проверка вебхука Electro Demo CRM" });
}
