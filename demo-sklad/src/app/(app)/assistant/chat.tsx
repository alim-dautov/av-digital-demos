"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, Textarea, cn } from "@/components/ui";
import { askAssistantAction } from "@/modules/assistant/actions";

type Msg = { role: "user" | "assistant"; content: string; tools?: { title: string; ok: boolean }[] };
const EXAMPLES = ["Остаток ввг 3х2,5", "Кто нам должен?", "Что ниже минимума?", "Сводка продаж", "Мои задачи"];

export function AssistantChat({ name, tools }: { name: string; tools: { name: string; title: string; write: boolean }[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [msgs, pending]);
  const send = (t = text) => {
    const content = t.trim();
    if (!content || pending) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(next); setText("");
    start(async () => {
      const r = await askAssistantAction({ messages: next.map(({ role, content }) => ({ role, content })).slice(-20) });
      if (!r.ok) { toast.error(r.error); return; }
      setMsgs((m) => [...m, { role: "assistant", content: r.data.text, tools: r.data.tools }]);
    });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <Card className="flex min-h-[60dvh] flex-col overflow-hidden">
        <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5" aria-live="polite">
          {!msgs.length && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <span className="grid size-12 place-items-center rounded-2xl bg-yellow/20 text-navy dark:text-yellow"><Sparkles className="size-6" /></span>
              <p className="text-lg font-bold">Здравствуйте, {name}!</p>
              <p className="max-w-sm text-sm text-ink-3">Спросите про остатки, цены, долги, заявки или задачи. Ассистент видит только то, на что у вас есть права.</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">{EXAMPLES.map((e) => <button key={e} onClick={() => send(e)} className="min-h-10 rounded-full border border-line px-3.5 text-sm hover:bg-surface-2">{e}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-navy text-white" : "bg-surface-2")}>
                {m.content}
                {!!m.tools?.length && <p className="mt-2 flex flex-wrap gap-1 text-[11px] text-ink-3">{m.tools.map((t, j) => <span key={j} className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5"><Wrench className="size-3" />{t.title}{!t.ok && " ✕"}</span>)}</p>}
              </div>
            </div>
          ))}
          {pending && <div className="flex"><div className="flex gap-1 rounded-2xl bg-surface-2 px-4 py-3">{[0, 1, 2].map((d) => <span key={d} className="size-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${d * 120}ms` }} />)}</div></div>}
          <div ref={end} />
        </div>
        <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: сколько стоит перфоратор ПЭ-800" className="max-h-40 min-h-11 flex-1 resize-none" rows={1}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Сообщение ассистенту" />
          <Button variant="accent" size="icon" type="submit" loading={pending} aria-label="Отправить"><Send className="size-4" /></Button>
        </form>
      </Card>
      <Card className="self-start p-4 sm:p-5">
        <p className="mb-2 text-sm font-bold">Доступные инструменты</p>
        <ul className="space-y-1.5 text-sm">{tools.map((t) => <li key={t.name} className="flex items-center justify-between gap-2"><span>{t.title}</span><code className="text-[11px] text-ink-3">{t.name}</code></li>)}</ul>
        <p className="mt-3 text-xs text-ink-3">Те же инструменты доступны внешним ИИ через MCP-сервер (Настройки → API и MCP).</p>
      </Card>
    </div>
  );
}
