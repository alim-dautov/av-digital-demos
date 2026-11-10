"use client";
import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Modal, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { whatsappAction } from "@/modules/whatsapp/actions";

/** Поделиться ссылкой: копировать / WhatsApp (через WhatsAppProvider; заглушка открывает wa.me) */
export function ShareButtons({ url, text, phone, entity, entityId }: { url: string; text: string; phone?: string | null; entity?: string; entityId?: number }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(phone ?? "");
  const [msg, setMsg] = useState(text);
  const { pending, run } = useRun();
  const abs = url.startsWith("http") ? url : `${typeof location !== "undefined" ? location.origin : ""}${url}`;
  return (
    <>
      <Button size="sm" variant="ghost" icon={<Copy className="size-4" />} onClick={async () => { await navigator.clipboard.writeText(abs); toast.success("Ссылка скопирована"); }}>Ссылка</Button>
      <Button size="sm" variant="secondary" icon={<MessageCircle className="size-4" />} onClick={() => setOpen(true)}>WhatsApp</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Отправить в WhatsApp"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button>
          <Button variant="accent" loading={pending} onClick={() => run(() => whatsappAction({ to, text: msg, url: abs, entity, entityId }), { refresh: false, onOk: (r) => {
            if (r.mode === "link") window.open(r.url, "_blank", "noopener"); else toast.success("Сообщение отправлено");
            setOpen(false);
          } })}>Отправить</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Номер" hint="пусто — выбрать контакт в WhatsApp"><Input type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
          <Field label="Текст"><Textarea value={msg} onChange={(e) => setMsg(e.target.value)} className="min-h-20" /></Field>
          <p className="text-xs text-ink-3">Ссылка добавится в конец сообщения. Прямая отправка через API включается в настройках интеграции.</p>
        </div>
      </Modal>
    </>
  );
}
