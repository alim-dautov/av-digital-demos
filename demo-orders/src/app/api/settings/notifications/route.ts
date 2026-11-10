import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import {
  AccountError,
  CONFIGURABLE_NOTIFICATION_TYPES,
  getNotificationPrefs,
  updateNotificationPrefs,
} from "@/lib/services/account-settings";
import type { NotificationType } from "@/types";

const TYPES = CONFIGURABLE_NOTIFICATION_TYPES.map((t) => t.type) as [
  NotificationType,
  ...NotificationType[],
];

const bodySchema = z.object({
  push: z.boolean(),
  muted: z.array(z.enum(TYPES)).max(TYPES.length),
});

async function sessionOr401() {
  await bootstrap();
  return getSession();
}

export async function GET() {
  const session = await sessionOr401();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  return NextResponse.json({ prefs: getNotificationPrefs(session.id) });
}

/** Each user edits only their own preferences. */
export async function PATCH(request: Request) {
  const session = await sessionOr401();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  const { data, error } = await parseJson(request, bodySchema, "Неверные настройки");
  if (error) return error;
  try {
    const prefs = await updateNotificationPrefs(session.id, data);
    return NextResponse.json({ prefs });
  } catch (e) {
    if (e instanceof AccountError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
