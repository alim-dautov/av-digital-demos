import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { pushSubscriptions } from "@/db/schema";

let configured: boolean | null = null;
function ensure() {
  if (configured !== null) return configured;
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  configured = !!(pub && priv);
  if (configured) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub!, priv!);
  return configured;
}

export async function sendPush(db: DB, userId: number, payload: { title: string; body: string; link?: string | null; tag?: string }) {
  if (!ensure()) return;
  const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 3600 });
    } catch (e: unknown) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    }
  }));
}
