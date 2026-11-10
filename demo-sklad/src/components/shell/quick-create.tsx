"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ClipboardList, Filter, Kanban, Plus, StickyNote, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { createTaskAction } from "@/modules/tasks/actions";
import { saveNoteAction } from "@/modules/notes/actions";
import { createLeadAction } from "@/modules/leads/actions";

export type QuickCtx = { me: number; people: { id: number; name: string; isSalesManager: boolean }[]; can: { task: boolean; note: boolean; lead: boolean; order: boolean } };
type Kind = "task" | "note" | "lead";

export function QuickCreate({ ctx }: { ctx: QuickCtx }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const opts = [
    ctx.can.order && { k: "order", label: "Заявка", icon: ClipboardList, run: () => router.push("/orders/new") },
    ctx.can.task && { k: "task", label: "Задача", icon: Kanban, run: () => setKind("task") },
    ctx.can.lead && { k: "lead", label: "Лид", icon: Filter, run: () => setKind("lead") },
    ctx.can.note && { k: "note", label: "Заметка", icon: StickyNote, run: () => setKind("note") },
  ].filter(Boolean) as { k: string; label: string; icon: typeof Plus; run: () => void }[];
  useEffect(() => {
    if (!menu) return;
    const on = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [menu]);
  if (!opts.length) return null;
  return (
    <>
      {menu && <div className="animate-in fixed inset-0 z-40 bg-[#071a33]/30 backdrop-blur-[1px]" onClick={() => setMenu(false)} />}
      <div className="fixed right-4 z-50 flex flex-col items-end gap-2 bottom-[calc(80px+env(safe-area-inset-bottom))] lg:bottom-8 lg:right-8">
        {menu && opts.map((o, i) => (
          <button key={o.k} onClick={() => { setMenu(false); o.run(); }} style={{ animationDelay: `${(opts.length - i) * 30}ms` }}
            className="animate-up flex h-12 items-center gap-3 rounded-full border border-line bg-surface pl-4 pr-5 text-sm font-bold text-ink shadow-pop transition-colors hover:bg-surface-2">
            <span className="grid size-8 place-items-center rounded-full bg-navy-50 text-navy dark:text-yellow"><o.icon className="size-4" /></span>{o.label}
          </button>
        ))}
        <button onClick={() => setMenu(!menu)} aria-label={menu ? "Закрыть меню создания" : "Быстро создать"} aria-expanded={menu}
          className="grid size-14 place-items-center rounded-full bg-yellow text-navy shadow-[0_10px_30px_-8px_rgb(255_181_16/0.8)] transition-transform duration-200 hover:scale-105 active:scale-95">
          {menu ? <X className="size-6" /> : <Plus className="size-7" strokeWidth={2.5} />}
        </button>
      </div>
      <Modal open={kind === "task"} onClose={() => setKind(null)} title="Новая задача"><TaskQuick ctx={ctx} done={() => setKind(null)} /></Modal>
      <Modal open={kind === "lead"} onClose={() => setKind(null)} title="Новый лид"><LeadQuick ctx={ctx} done={() => setKind(null)} /></Modal>
      <Modal open={kind === "note"} onClose={() => setKind(null)} title="Новая заметка"><NoteQuick done={() => setKind(null)} /></Modal>
    </>
  );
}

function useSubmit() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return {
    pending,
    run: <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, ok: string, after: (d: T) => void) =>
      start(async () => {
        const r = await fn();
        if (!r.ok) { toast.error(r.error); return; }
        toast.success(ok);
        after(r.data);
        router.refresh();
      }),
  };
}

function TaskQuick({ ctx, done }: { ctx: QuickCtx; done: () => void }) {
  const [title, setTitle] = useState("");
  const [assigneeId, setAssignee] = useState(ctx.me);
  const [dueAt, setDue] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [description, setDesc] = useState("");
  const s = useSubmit();
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      s.run(() => createTaskAction({ title, assigneeId, dueAt: dueAt ? new Date(dueAt).toISOString() : null, priority, description }), "Задача создана", done);
    }}>
      <Field label="Что сделать" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required placeholder="Позвонить клиенту по оплате" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ответственный"><Select value={assigneeId} onChange={(e) => setAssignee(Number(e.target.value))}>{ctx.people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === ctx.me ? " (я)" : ""}</option>)}</Select></Field>
        <Field label="Срок"><Input type="datetime-local" value={dueAt} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <Field label="Приоритет">
        <div className="grid grid-cols-4 gap-1.5">
          {([["low", "Низкий"], ["normal", "Обычный"], ["high", "Высокий"], ["urgent", "Срочно"]] as const).map(([k, l]) => (
            <button type="button" key={k} onClick={() => setPriority(k)} className={cn("h-10 rounded-xl border text-xs font-semibold transition-colors", priority === k ? "border-yellow bg-yellow-50 text-navy dark:bg-white/5 dark:text-yellow" : "border-line text-ink-2")}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="Описание"><Textarea value={description} onChange={(e) => setDesc(e.target.value)} placeholder="Детали, @упоминания коллег" /></Field>
      <Button type="submit" variant="accent" size="lg" loading={s.pending}>Создать задачу</Button>
    </form>
  );
}

function LeadQuick({ ctx, done }: { ctx: QuickCtx; done: () => void }) {
  const [f, setF] = useState({ title: "", contactName: "", phone: "", source: "", amount: 0, managerId: ctx.people.find((p) => p.id === ctx.me && p.isSalesManager)?.id ?? null as number | null, segment: "other" as "bazaar" | "shop" | "install" | "other", nextFollowUpAt: "", comment: "" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const s = useSubmit();
  const managers = ctx.people.filter((p) => p.isSalesManager);
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => {
      e.preventDefault();
      s.run(() => createLeadAction({ ...f, phone: f.phone || null, nextFollowUpAt: f.nextFollowUpAt ? new Date(f.nextFollowUpAt).toISOString() : null }), "Лид добавлен в воронку", done);
    }}>
      <Field label="Название сделки" required><Input value={f.title} onChange={(e) => set("title", e.target.value)} autoFocus required placeholder="Кабель на объект ЖК «Алатау»" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Контакт"><Input value={f.contactName} onChange={(e) => set("contactName", e.target.value)} placeholder="Имя" /></Field>
        <Field label="Телефон"><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
        <Field label="Сумма сделки"><MoneyInput value={f.amount} onChange={(v) => set("amount", v)} /></Field>
        <Field label="Сегмент"><Select value={f.segment} onChange={(e) => set("segment", e.target.value as typeof f.segment)}>
          <option value="bazaar">Базар</option><option value="shop">Магазин</option><option value="install">Монтаж</option><option value="other">Другое</option></Select></Field>
        <Field label="Менеджер"><Select value={f.managerId ?? ""} onChange={(e) => set("managerId", e.target.value ? Number(e.target.value) : null)}>
          <option value="">— не назначен —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select></Field>
        <Field label="Следующий контакт"><Input type="datetime-local" value={f.nextFollowUpAt} onChange={(e) => set("nextFollowUpAt", e.target.value)} /></Field>
      </div>
      <Field label="Источник"><Input value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Instagram, звонок, рекомендация…" /></Field>
      <Button type="submit" variant="accent" size="lg" loading={s.pending}>Добавить лид</Button>
    </form>
  );
}

function NoteQuick({ done }: { done: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVis] = useState<"all" | "private">("all");
  const s = useSubmit();
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); s.run(() => saveNoteAction({ id: null, data: { title, body, visibility } }), "Заметка сохранена", done); }}>
      <Field label="Заголовок" required><Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></Field>
      <Field label="Текст"><Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-40" /></Field>
      <Field label="Кто видит"><Select value={visibility} onChange={(e) => setVis(e.target.value as "all" | "private")}><option value="all">Вся команда</option><option value="private">Только я</option></Select></Field>
      <Button type="submit" variant="accent" size="lg" loading={s.pending}>Сохранить</Button>
    </form>
  );
}
