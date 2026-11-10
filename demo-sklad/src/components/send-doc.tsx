"use client";
import { useState } from "react";
import { Copy, ExternalLink, MessageCircle, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Modal, Textarea, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { sendDocVersionAction } from "@/modules/docs/actions";
import { whatsappAction } from "@/modules/whatsapp/actions";

type Sent = { version: number; url: string; absUrl: string; fileName: string; title: string; reused: boolean; changes: string[] };

/**
 * «Отправить клиенту»: формирует отдельную неизменяемую версию PDF (v1, v2…) и отдаёт её файлом
 * (системное «Поделиться» на телефоне — PDF уходит прямо в WhatsApp) или ссылкой на этот файл.
 */
export function SendDocButton({ entity, id, text, phone, variant = "accent" }: { entity: "order" | "shipment" | "quote"; id: number; text: string; phone?: string | null; variant?: "accent" | "primary" | "secondary" }) {
  const [sent, setSent] = useState<Sent | null>(null);
  const [to, setTo] = useState(phone ?? "");
  const [msg, setMsg] = useState(text);
  const make = useRun();
  const wa = useRun();
  const [sharing, setSharing] = useState(false);
  const abs = sent ? (sent.absUrl.startsWith("http") ? sent.absUrl : `${location.origin}${sent.url}`) : "";
  const message = sent ? `${msg} (версия ${sent.version})` : msg;

  async function shareFile() {
    if (!sent) return;
    setSharing(true);
    try {
      const blob = await fetch(sent.url).then((r) => { if (!r.ok) throw new Error(); return r.blob(); });
      const file = new File([blob], sent.fileName, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: sent.title, text: message });
      } else {
        // на компьютере — просто скачать файл, его можно перетащить в WhatsApp Web
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = sent.fileName; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast.success("PDF скачан — прикрепите его в чате с клиентом");
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Не удалось подготовить файл");
    } finally { setSharing(false); }
  }

  return (
    <>
      <Button variant={variant} icon={<Send className="size-4" />} loading={make.pending}
        onClick={() => make.run(() => sendDocVersionAction({ entity, id }), { refresh: true, onOk: (r) => setSent(r) })}>Отправить клиенту</Button>
      <Modal open={!!sent} onClose={() => setSent(null)} size="sm" title={sent ? `${sent.title}` : ""}
        footer={<><Button variant="ghost" onClick={() => setSent(null)}>Закрыть</Button>
          <Button variant="accent" icon={<Share2 className="size-4" />} loading={sharing} onClick={shareFile}>Отправить PDF</Button></>}>
        {sent && (
          <div className="flex flex-col gap-4">
            {sent.reused
              ? <p className="rounded-xl bg-surface-2 p-3 text-sm">С версии {sent.version} ничего не изменилось — отправляется тот же файл.</p>
              : <p className="rounded-xl bg-success-bg p-3 text-sm">Сформирована версия {sent.version}. Файл зафиксирован: дальнейшие правки попадут уже в следующую версию.</p>}
            {sent.changes.length > 0 && (
              <div className="text-sm"><p className="mb-1 font-semibold">Изменения к версии {sent.version - 1}</p>
                <ul className="list-disc space-y-0.5 pl-5 text-ink-2">{sent.changes.slice(0, 8).map((c) => <li key={c}>{c}</li>)}{sent.changes.length > 8 && <li>… ещё {sent.changes.length - 8}</li>}</ul>
              </div>
            )}
            <Field label="Текст сообщения"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="min-h-16" /></Field>
            <div className="flex flex-wrap gap-2">
              <a href={sent.url} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}><ExternalLink className="size-4" />Открыть PDF</a>
              <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={async () => { await navigator.clipboard.writeText(abs); toast.success("Ссылка на файл скопирована"); }}>Ссылка на файл</Button>
            </div>
            <div className="flex items-end gap-2 border-t border-line pt-4">
              <Field label="WhatsApp ссылкой" hint="номер пусто — выбрать контакт" className="flex-1"><Input type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
              <Button variant="secondary" icon={<MessageCircle className="size-4" />} loading={wa.pending}
                onClick={() => wa.run(() => whatsappAction({ to, text: message, url: abs, entity, entityId: id }), { refresh: false, onOk: (r) => { if (r.mode === "link") window.open(r.url, "_blank", "noopener"); else toast.success("Отправлено"); } })}>Отправить</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
