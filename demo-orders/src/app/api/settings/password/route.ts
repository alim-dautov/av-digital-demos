import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { clearSessionCookie, getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import {
  AccountError,
  changeOwnPassword,
  SELF_PASSWORD_MAX,
} from "@/lib/services/account-settings";

const bodySchema = z.object({
  current: z.string().min(1).max(SELF_PASSWORD_MAX),
  next: z.string().max(SELF_PASSWORD_MAX),
  confirm: z.string().max(SELF_PASSWORD_MAX),
});

/** Any signed-in user changes only their own password. */
export async function POST(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  const { data, error } = await parseJson(request, bodySchema, "Заполните все поля");
  if (error) return error;
  try {
    await changeOwnPassword(session.id, data);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось сменить пароль" }, { status: 500 });
  }
}
