"use client";
import { useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { whatsappAction } from "@/modules/whatsapp/actions";

const TEMPLATES = [
  "Здравствуйте! Это Electro Demo. Ваш заказ собран, можно забирать.",
  "Здравствуйте! Напоминаем об оплате по накладной. Спасибо!",
  "Здравствуйте! Отправляем актуальный прайс Electro Demo.",
];

export function WaCompose() {
  const [to, setTo] = useState("");
  const [text, setText] = useState("");
  const { pending, run } = useRun();
  return (
    <form className="flex flex-col gap-3 px-4 pb-5 sm:px-5" onSubmit={(e) => {
      e.preventDefault();
      run(() => whatsappAction({ to, text }), { onOk: (r) => { if (r.mode === "link") window.open(r.url, "_blank", "noopener"); else toast.success("Отправлено"); setText(""); } });
    }}>
      <Field label="Номер" hint="пусто — выбрать контакт в WhatsApp"><Input type="tel" inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
      <Field label="Сообщение"><Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-28" /></Field>
      <div className="flex flex-wrap gap-1.5">{TEMPLATES.map((t) => <button key={t} type="button" onClick={() => setText(t)} className="min-h-9 rounded-full border border-line px-3 text-left text-xs hover:bg-surface-2">{t.slice(13, 45)}…</button>)}</div>
      <Button variant="accent" type="submit" loading={pending} disabled={!text.trim()} icon={<Send className="size-4" />}>Отправить</Button>
    </form>
  );
}
