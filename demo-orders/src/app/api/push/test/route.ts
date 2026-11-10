import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData } from "@/lib/db";
import { pushConfigured } from "@/lib/push";
import { createNotification } from "@/lib/services/notifications";

export async function POST() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push-уведомления не настроены на сервере" }, { status: 503 });
  }
  const devices = getData().pushSubscriptions.filter((s) => s.userId === session.id).length;
  if (devices === 0) {
    return NextResponse.json({ error: "Это устройство не подписано на уведомления" }, { status: 409 });
  }
  await createNotification({
    companyId: session.companyId,
    userId: session.id,
    type: "test",
    title: "Проверка уведомлений",
    body: "Если вы видите это сообщение, push-уведомления работают.",
    href: "/",
  });
  return NextResponse.json({ ok: true, devices });
}
