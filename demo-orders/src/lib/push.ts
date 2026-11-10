import webpush from "web-push";
import { getData, mutateData } from "@/lib/db";
import { companyIconPath, getCompanyAppById, prefixAppPath } from "@/lib/company-apps";
import { notificationPrefsOf, pushAllowed } from "@/lib/services/account-settings";
import type { Notification } from "@/types";

let configured: boolean | null = null;

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || null;
}

function configure(): boolean {
  if (configured !== null) return configured;
  const publicKey = getVapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@example.kz";
  if (!publicKey || !privateKey) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return configure();
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  icon?: string;
  badge?: string;
};

/** Notification icon of the company app (root Mebel Demo icon otherwise). */
export function notificationIcon(companyId: string): string | undefined {
  const app = getCompanyAppById(companyId);
  return app ? companyIconPath(app.slug, 192) : undefined;
}

/** Monochrome badge: only Mebel Demo has one; others keep their app icon. */
export function notificationBadge(companyId: string): string | undefined {
  const app = getCompanyAppById(companyId);
  if (!app || app.slug === "mebeldemo") return "/app-icons/badge-96.png";
  return companyIconPath(app.slug, 192);
}

/** Link inside the company app, so the PWA opens in its own scope. */
export function notificationUrl(n: Pick<Notification, "companyId" | "href">): string {
  const href = n.href ?? "/";
  const app = getCompanyAppById(n.companyId);
  return app ? prefixAppPath(app.slug, href) : href;
}

/** Sends to every device of every recipient. Expired subscriptions are removed. */
export async function deliverPush(notifications: Notification[]): Promise<void> {
  if (notifications.length === 0 || !configure()) return;
  const data = getData();
  const subs = data.pushSubscriptions;
  const prefsByUser = new Map(data.users.map((u) => [u.id, notificationPrefsOf(u)]));
  const gone = new Set<string>();

  await Promise.allSettled(
    notifications.flatMap((n) => {
      const targets = subs.filter(
        (s) =>
          s.companyId === n.companyId &&
          (n.userId === null || s.userId === n.userId) &&
          pushAllowed(prefsByUser.get(s.userId) ?? notificationPrefsOf(null), n.type),
      );
      const payload: PushPayload = {
        title: n.title,
        body: n.body,
        url: notificationUrl(n),
        tag: n.dedupeKey ?? n.id,
        icon: notificationIcon(n.companyId),
        badge: notificationBadge(n.companyId),
      };
      return targets.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: s.keys },
            JSON.stringify(payload),
            { TTL: 24 * 60 * 60, urgency: "high", topic: topicOf(payload.tag) },
          );
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.add(s.id);
          else console.error("push failed", status ?? e);
        }
      });
    }),
  );

  if (gone.size > 0) {
    mutateData((data) => {
      data.pushSubscriptions = data.pushSubscriptions.filter((s) => !gone.has(s.id));
    });
  }
}

/** Push services replace a pending message with the same topic (max 32 url-safe chars). */
function topicOf(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i += 1) hash = (hash * 31 + tag.charCodeAt(i)) | 0;
  return `n${(hash >>> 0).toString(36)}`;
}
