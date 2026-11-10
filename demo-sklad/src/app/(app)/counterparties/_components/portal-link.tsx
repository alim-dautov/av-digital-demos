"use client";
import { useState } from "react";
import { Copy, ExternalLink, Link2, MessageCircle, RefreshCw, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { portalLinkAction, portalRevokeAction } from "@/modules/counterparties/actions";

/** Ссылка на личный кабинет контрагента: создать, скопировать, отправить, перевыпустить, отозвать */
export function PortalLink({ cpId, name, phone, path, createdAt, viewedAt, manage }: {
  cpId: number; name: string; phone: string; path: string | null; createdAt: string | null; viewedAt: string | null; manage: boolean;
}) {
  const { pending, run } = useRun();
  const [busy, setBusy] = useState<string | null>(null);
  const abs = (u: string) => (u.startsWith("http") ? u : `${location.origin}${u}`);
  const get = async (regenerate = false) => {
    setBusy(regenerate ? "regen" : "get");
    try { const u = await run(() => portalLinkAction({ id: cpId, regenerate })); return u ? abs(u) : null; } finally { setBusy(null); }
  };
  const copy = async () => {
    const u = await get();
    if (u) { await navigator.clipboard.writeText(u).catch(() => {}); toast.success("Ссылка на кабинет скопирована"); }
  };
  const wa = async () => {
    const u = await get();
    if (!u) return;
    const text = `Здравствуйте! Это ваш личный кабинет ${name} в Electro Demo: заявки, накладные, оплаты и текущий долг всегда под рукой. ${u}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const fmt = (v: string) => new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-yellow-50 text-navy dark:bg-white/10 dark:text-ink"><Link2 className="size-5" /></span>
        <div className="min-w-0">
          <p className="text-sm font-bold">Личный кабинет клиента</p>
          <p className="text-xs text-ink-3">
            {path
              ? <>Ссылка выдана{createdAt && ` ${fmt(createdAt)}`} · {viewedAt ? `клиент открывал ${fmt(viewedAt)}` : "ещё не открывали"}</>
              : "Клиент по ссылке видит свои заявки, накладные, оплаты, долг и акт сверки — без входа в систему"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {path ? <>
          <Button size="sm" icon={<Copy className="size-4" />} loading={busy === "get"} disabled={pending} onClick={copy}>Копировать</Button>
          {phone && <Button size="sm" variant="secondary" icon={<MessageCircle className="size-4" />} disabled={pending} onClick={wa}>WhatsApp</Button>}
          <a href={path} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}><ExternalLink className="size-4" />Открыть</a>
          {manage && <Button size="sm" variant="ghost" icon={<RefreshCw className="size-4" />} loading={busy === "regen"} disabled={pending} onClick={async () => {
            if (!confirm("Выпустить новую ссылку? Старая перестанет работать.")) return;
            const u = await get(true);
            if (u) { await navigator.clipboard.writeText(u).catch(() => {}); toast.success("Новая ссылка скопирована"); }
          }}>Новая</Button>}
          {manage && <Button size="sm" variant="ghost" icon={<Unlink className="size-4" />} disabled={pending} onClick={async () => {
            if (!confirm("Отозвать ссылку? Клиент больше не сможет открыть кабинет.")) return;
            await run(() => portalRevokeAction({ id: cpId }), { onOk: () => toast.success("Ссылка отозвана") });
          }}>Отозвать</Button>}
        </> : <>
          <Button size="sm" variant="primary" icon={<Copy className="size-4" />} loading={busy === "get"} disabled={pending} onClick={copy}>Создать и скопировать</Button>
          {phone && <Button size="sm" variant="secondary" icon={<MessageCircle className="size-4" />} disabled={pending} onClick={wa}>Отправить в WhatsApp</Button>}
        </>}
      </div>
    </Card>
  );
}
