import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import { getVapidPublicKey, pushConfigured } from "@/lib/push";
import { removePushSubscription, savePushSubscription } from "@/lib/services/push-subscriptions";

const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2000)
    .refine((v) => v.startsWith("https://"), "Адрес подписки должен быть https"),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2000) });

async function sessionOr401() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const { session, error } = await sessionOr401();
  if (error) return error;
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const mine = getData().pushSubscriptions.filter((s) => s.userId === session.id);
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: getVapidPublicKey(),
    devices: mine.length,
    subscribed: endpoint ? mine.some((s) => s.endpoint === endpoint) : mine.length > 0,
  });
}

export async function POST(request: Request) {
  const { session, error } = await sessionOr401();
  if (error) return error;
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push-уведомления не настроены на сервере" }, { status: 503 });
  }
  const { data, error: bad } = await parseJson(request, subscribeSchema);
  if (bad) return bad;
  savePushSubscription(session, data, request.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { session, error } = await sessionOr401();
  if (error) return error;
  const { data, error: bad } = await parseJson(request, unsubscribeSchema);
  if (bad) return bad;
  removePushSubscription(data.endpoint, session.id);
  return NextResponse.json({ ok: true });
}
