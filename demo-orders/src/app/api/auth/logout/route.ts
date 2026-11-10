import { getSession } from "@/lib/auth";
import { expireSessionCookies } from "@/lib/session-cookies";
import { removePushSubscription } from "@/lib/services/push-subscriptions";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { pushEndpoint?: unknown } | null;
  const session = await getSession();
  if (session && typeof body?.pushEndpoint === "string") {
    removePushSubscription(body.pushEndpoint, session.id);
  }
  const headers = new Headers({ "Content-Type": "application/json" });
  expireSessionCookies(headers);
  return new Response(JSON.stringify({ ok: true }), { headers });
}
