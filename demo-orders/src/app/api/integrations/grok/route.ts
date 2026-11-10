import { NextResponse } from "next/server";
import { bootstrap } from "@/lib/bootstrap";
import {
  getGrokAuthAdapter,
  grokCatalog,
  handleGrokRequest,
  rejectGrokRequest,
} from "@/lib/integrations/grok";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const requests = createRateLimiter(60, 60_000);
const authFailures = createRateLimiter(10, 15 * 60_000);

function guard(request: Request) {
  const ip = clientIp(request);
  const keys = [`grok:${ip}`];
  const failKeys = [`grok-auth:${ip}`];
  const wait = Math.max(requests.retryAfter(keys), authFailures.retryAfter(failKeys));
  if (wait > 0) {
    const rejected = rejectGrokRequest(429, "Слишком много запросов", ip);
    return NextResponse.json(rejected.body, {
      status: 429,
      headers: { "Retry-After": String(wait) },
    });
  }
  requests.hit(keys);
  const auth = getGrokAuthAdapter().verify(request);
  if (!auth.ok) {
    authFailures.hit(failKeys);
    const rejected = rejectGrokRequest(auth.status, auth.error, ip);
    return NextResponse.json(rejected.body, { status: auth.status });
  }
  return null;
}

/** Command catalog for the bot. No company data and no secrets. */
export async function GET(request: Request) {
  await bootstrap();
  const denied = guard(request);
  if (denied) return denied;
  return NextResponse.json({
    connector: "grok",
    version: 1,
    auth: getGrokAuthAdapter().id,
    commands: grokCatalog(),
  });
}

export async function POST(request: Request) {
  await bootstrap();
  const denied = guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const result = await handleGrokRequest(body, clientIp(request));
  return NextResponse.json(result.body, { status: result.status });
}
