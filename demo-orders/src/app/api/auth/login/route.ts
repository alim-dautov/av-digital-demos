import { NextResponse } from "next/server";
import { z } from "zod";
import { loginWithCredentials } from "@/lib/auth";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const bodySchema = z
  .object({
    login: z.string().trim().toLowerCase().min(1).max(254).optional(),
    email: z.string().trim().toLowerCase().min(1).max(254).optional(),
    password: z.string().min(1).max(200),
  })
  .refine((b) => Boolean(b.login ?? b.email));

const loginLimiter = createRateLimiter(5, 15 * 60 * 1000);
const INVALID = "Неверный логин или пароль";

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }
  const identifier = (parsed.data.login ?? parsed.data.email)!;
  const { password } = parsed.data;
  const keys = [`login:ip:${clientIp(request)}`, `login:id:${identifier}`];

  const wait = loginLimiter.retryAfter(keys);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Слишком много попыток. Повторите через ${Math.ceil(wait / 60)} мин.` },
      { status: 429, headers: { "Retry-After": String(wait) } },
    );
  }

  try {
    const user = await loginWithCredentials(identifier, password);
    if (!user) {
      loginLimiter.hit(keys);
      return NextResponse.json({ error: INVALID }, { status: 401 });
    }
    loginLimiter.reset([`login:id:${identifier}`]);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
