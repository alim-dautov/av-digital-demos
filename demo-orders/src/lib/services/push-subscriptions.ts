import { mutateData } from "@/lib/db";
import { generateId, nowIso } from "@/lib/utils";
import type { SessionUser } from "@/types";

/** One record per device endpoint: a device signing in as another user moves to that user. */
export function savePushSubscription(
  user: Pick<SessionUser, "id" | "companyId">,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent: string | null,
): void {
  mutateData((data) => {
    const existing = data.pushSubscriptions.find((s) => s.endpoint === sub.endpoint);
    if (existing) {
      existing.userId = user.id;
      existing.companyId = user.companyId;
      existing.keys = sub.keys;
      existing.userAgent = userAgent?.slice(0, 300) ?? null;
      return;
    }
    data.pushSubscriptions.push({
      id: generateId("push"),
      userId: user.id,
      companyId: user.companyId,
      endpoint: sub.endpoint,
      keys: sub.keys,
      userAgent: userAgent?.slice(0, 300) ?? null,
      createdAt: nowIso(),
    });
  });
}

export function removePushSubscription(endpoint: string, userId?: string): boolean {
  let removed = false;
  mutateData((data) => {
    const before = data.pushSubscriptions.length;
    data.pushSubscriptions = data.pushSubscriptions.filter(
      (s) => !(s.endpoint === endpoint && (!userId || s.userId === userId)),
    );
    removed = data.pushSubscriptions.length !== before;
  });
  return removed;
}
