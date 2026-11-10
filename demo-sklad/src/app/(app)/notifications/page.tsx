import Link from "next/link";
import { eq } from "drizzle-orm";
import { Bell, KeyRound } from "lucide-react";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, buttonClass, cn } from "@/components/ui";
import { listNotifications, NOTIFY_TYPES } from "@/modules/notifications/service";
import { MarkAllRead, NotifyPrefs, PushToggle } from "./notify-tools";

export const metadata = { title: "Уведомления" };

export default async function NotificationsPage() {
  const u = await requireUser();
  const db = await getDb();
  const [items, [me]] = await Promise.all([listNotifications(db, u.id, 100), db.select({ prefs: users.notifyPrefs }).from(users).where(eq(users.id, u.id))]);
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader title="Уведомления" subtitle={unread ? `${unread} непрочитанных` : "Все прочитаны"} actions={unread ? <MarkAllRead /> : null} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0 overflow-hidden">
          {!items.length ? <EmptyState icon={<Bell className="size-6" />} title="Пока пусто" text="Здесь появятся задачи, лиды, статусы заявок и напоминания" /> : (
            <ul className="divide-y divide-line">
              {items.map((n) => {
                const body = (
                  <div className={cn("flex gap-3 px-4 py-3 sm:px-5", !n.readAt && "bg-yellow/[0.07]")}>
                    <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-yellow")} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>}
                      <p className="mt-1 text-xs text-ink-3">{NOTIFY_TYPES[n.type as keyof typeof NOTIFY_TYPES] ?? n.type} · {fmtDate(n.createdAt, true)}</p>
                    </div>
                  </div>
                );
                return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-surface-2">{body}</Link> : body}</li>;
              })}
            </ul>
          )}
        </Card>
        <div className="flex flex-col gap-5 self-start">
          <Card>
            <CardHeader title="Push на это устройство" subtitle="уведомления придут, даже если приложение закрыто" />
            <div className="px-4 pb-4 sm:px-5"><PushToggle vapidKey={process.env.VAPID_PUBLIC_KEY || null} /></div>
          </Card>
          <Card>
            <CardHeader title="Что присылать" subtitle="в приложении и push" />
            <NotifyPrefs types={Object.entries(NOTIFY_TYPES).map(([key, label]) => ({ key, label }))} prefs={me?.prefs ?? {}} />
          </Card>
          <Link href="/change-password" className={buttonClass("secondary", "md", "w-full")}><KeyRound className="size-4" />Сменить пароль</Link>
        </div>
      </div>
    </>
  );
}
