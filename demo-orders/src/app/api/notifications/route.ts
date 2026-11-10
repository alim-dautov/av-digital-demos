import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { bootstrap } from "@/lib/bootstrap";
import {
  listNotifications,
  markAllRead,
  markRead,
  markReadByType,
  unreadCount,
} from "@/lib/services/notifications";
import { idSchema, parseJson } from "@/lib/api";

const patchSchema = z.object({
  id: idSchema.optional(),
  all: z.boolean().optional(),
  /** Clears the «Цех» badge once the queue is opened */
  workshopSeen: z.boolean().optional(),
});

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "notifications", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const notifications = listNotifications(session.companyId, session.id);
  return NextResponse.json({
    notifications,
    unread: unreadCount(session.companyId, session.id),
  });
}

export async function PATCH(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "notifications", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const { data: body, error } = await parseJson(
      request,
      patchSchema,
      "Укажите id уведомления или all: true",
    );
    if (error) return error;

    if (body.workshopSeen) {
      const count = markReadByType(session.companyId, session.id, ["workshop_new"]);
      return NextResponse.json({ ok: true, marked: count });
    }
    if (body.all) {
      const count = markAllRead(session.companyId, session.id);
      return NextResponse.json({ ok: true, marked: count });
    }
    if (!body.id) {
      return NextResponse.json(
        { error: "Укажите id уведомления или all: true" },
        { status: 400 },
      );
    }

    const ok = markRead(session.companyId, body.id, session.id);
    if (!ok) {
      return NextResponse.json(
        { error: "Уведомление не найдено" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Не удалось обновить уведомления" },
      { status: 500 },
    );
  }
}
