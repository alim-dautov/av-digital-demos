import { and, desc, eq } from "drizzle-orm";
import { MessageCircle } from "lucide-react";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { getWhatsApp } from "@/modules/whatsapp/provider";
import { WaCompose } from "./compose";

export const metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  const u = await requireUser("whatsapp");
  const db = await getDb();
  const wa = getWhatsApp();
  const own = !(u.isOwner || u.permissions.modules.team === "full");
  const log = await db.select({ id: auditLog.id, summary: auditLog.summary, entity: auditLog.entity, createdAt: auditLog.createdAt, userName: users.name })
    .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.action, "whatsapp"), own ? eq(auditLog.userId, u.id) : undefined)).orderBy(desc(auditLog.id)).limit(50);
  return (
    <>
      <PageHeader title="WhatsApp" subtitle={<span className="inline-flex items-center gap-2">{wa.name}{!wa.canSend && <Badge tone="info">заглушка: открывается wa.me</Badge>}</span>} />
      <div className="grid gap-5 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Card className="self-start"><CardHeader title="Написать" subtitle="КП, прайсы и акты удобнее отправлять кнопкой «WhatsApp» в самом документе" /><WaCompose /></Card>
        <Card className="min-w-0 overflow-hidden">
          <CardHeader title="История отправок" subtitle={own ? "ваши сообщения" : "все сотрудники"} />
          {!log.length ? <EmptyState icon={<MessageCircle className="size-6" />} title="Пока ничего не отправляли" /> : (
            <ul className="divide-y divide-line">{log.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm sm:px-5"><p className="break-words">{r.summary.replace(/^WhatsApp \([^)]*\) → /, "→ ")}</p><p className="mt-0.5 text-xs text-ink-3">{r.userName} · {fmtDate(r.createdAt, true)}{r.entity !== "message" && ` · ${r.entity}`}</p></li>
            ))}</ul>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-ink-3">Подключение API (WhatsApp Cloud API, Wazzup, Green-API): реализуйте WhatsAppProvider в src/modules/whatsapp/provider.ts и задайте WHATSAPP_PROVIDER.</p>
    </>
  );
}
