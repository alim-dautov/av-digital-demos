"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlarmClock, MessageSquare, Paperclip, Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge, Button, Field, Input, Modal, Select, Skeleton, Textarea, cn } from "@/components/ui";
import { Kanban, type KCol } from "@/components/kanban";
import { Attachments, type FileRef } from "@/components/file-upload";
import { useRun } from "@/components/use-run";
import { fmtDate, fmtRelative } from "@/lib/format";
import { commentTaskAction, createTaskAction, deleteTaskAction, getTaskAction, moveTaskAction, updateTaskAction } from "@/modules/tasks/actions";

export type TCard = { id: number; title: string; stageId: number; sort: number; assigneeId: number; assigneeName: string; assigneeColor: string; dueAt: string | null;
  priority: string; tags: string[]; commentsCount: number; attachmentsCount: number; completedAt: string | null };
type Person = { id: number; name: string };
const PRI: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "danger" }> = {
  low: { label: "низкий", tone: "neutral" }, normal: { label: "обычный", tone: "info" }, high: { label: "высокий", tone: "warning" }, urgent: { label: "срочно", tone: "danger" },
};

export function TaskBoard({ stages, tasks, people, me, canEdit }: { stages: (KCol & { isDone: boolean })[]; tasks: TCard[]; people: Person[]; me: number; canEdit: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = sp.get("open");
  const setOpen = (id: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (id) q.set("open", id); else q.delete("open");
    router.replace(`${path}?${q}`, { scroll: false });
  };
  const doneIds = new Set(stages.filter((s) => s.isDone).map((s) => s.id));
  return (
    <>
      <Kanban<TCard> columns={stages} items={tasks} canDrag={canEdit}
        onMove={(id, stageId, sort) => moveTaskAction({ id, stageId, sort })}
        colExtra={(c) => canEdit && c.id === stages[0]?.id ? <button onClick={() => setOpen("new")} className="mx-2 mb-1 flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-ink-3 hover:bg-surface hover:text-ink"><Plus className="size-4" />Новая задача</button> : null}
        render={(t) => {
          const overdue = t.dueAt && !t.completedAt && new Date(t.dueAt) < new Date();
          return (
            <button type="button" onClick={() => setOpen(String(t.id))} className={cn("w-full rounded-xl border border-line bg-surface p-3 text-left transition-shadow duration-150 hover:shadow-md", doneIds.has(t.stageId) && "opacity-70")}>
              <p className={cn("text-sm font-semibold leading-snug", doneIds.has(t.stageId) && "line-through")}>{t.title}</p>
              {t.tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{t.tags.map((g) => <span key={g} className="rounded-md bg-surface-2 px-1.5 text-[11px] text-ink-2">#{g}</span>)}</div>}
              <div className="mt-2 flex items-center gap-2 text-xs text-ink-3">
                <Avatar name={t.assigneeName} color={t.assigneeColor} size={22} />
                {t.priority !== "normal" && <Badge tone={PRI[t.priority].tone}>{PRI[t.priority].label}</Badge>}
                {t.dueAt && <span className={cn("flex items-center gap-1", overdue && "font-semibold text-danger")}><AlarmClock className="size-3.5" />{fmtDate(t.dueAt, true)}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {t.commentsCount > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="size-3.5" />{t.commentsCount}</span>}
                  {t.attachmentsCount > 0 && <span className="flex items-center gap-0.5"><Paperclip className="size-3.5" />{t.attachmentsCount}</span>}
                </span>
              </div>
            </button>
          );
        }} />
      <Modal open={!!open} onClose={() => setOpen(null)} side="right" size="lg" title={open === "new" ? "Новая задача" : "Задача"}>
        {open === "new" ? <TaskForm people={people} me={me} onDone={(id) => setOpen(id ? String(id) : null)} /> : open ? <TaskView key={open} id={Number(open)} people={people} me={me} canEdit={canEdit} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </>
  );
}

type Full = Awaited<ReturnType<typeof getTaskAction>> extends infer R ? R extends { ok: true; data: infer D } ? D : never : never;

function toLocalInput(v: string | Date | null) {
  if (!v) return "";
  const d = new Date(v);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function TaskForm({ people, me, initial, onDone }: { people: Person[]; me: number; initial?: Full; onDone: (id?: number) => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? "", description: initial?.description ?? "", assigneeId: initial?.assigneeId ?? me, dueAt: toLocalInput(initial?.dueAt ?? null),
    priority: (initial?.priority ?? "normal") as "low" | "normal" | "high" | "urgent", tags: (initial?.tags ?? []).join(", "), attachments: (initial?.attachments ?? []) as FileRef[],
  });
  const { pending, run } = useRun();
  const submit = () => {
    const data = { ...f, dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null, tags: f.tags.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean), stageId: initial?.stageId };
    if (initial) run(() => updateTaskAction({ id: initial.id, data }), { success: "Сохранено", onOk: () => onDone(initial.id) });
    else run(() => createTaskAction(data), { success: "Задача создана", onOk: (t) => onDone(t.id) });
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Название" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
      <Field label="Описание"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-24" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ответственный"><Select value={f.assigneeId} onChange={(e) => setF({ ...f, assigneeId: Number(e.target.value) })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.id === me ? " (я)" : ""}</option>)}</Select></Field>
        <Field label="Срок"><Input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} /></Field>
        <Field label="Приоритет"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as "normal" })}>{Object.entries(PRI).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
        <Field label="Теги" hint="через запятую"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="закуп, базар" /></Field>
      </div>
      <Attachments value={f.attachments} onChange={(v) => setF({ ...f, attachments: v })} />
      <div className="flex gap-2"><Button variant="accent" loading={pending} disabled={!f.title.trim()} onClick={submit}>{initial ? "Сохранить" : "Создать"}</Button><Button variant="ghost" onClick={() => onDone(initial?.id)}>Отмена</Button></div>
    </div>
  );
}

function TaskView({ id, people, me, canEdit, onClose }: { id: number; people: Person[]; me: number; canEdit: boolean; onClose: () => void }) {
  const [t, setT] = useState<Full | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const load = async () => { const r = await getTaskAction({ id }); if (r.ok) setT(r.data as Full); else setErr(r.error); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const del = useRun();
  if (err) return <p className="text-sm text-danger">{err}</p>;
  if (!t) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-20" /><Skeleton className="h-40" /></div>;
  if (edit) return <TaskForm people={people} me={me} initial={t} onDone={() => { setEdit(false); load(); }} />;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold leading-snug">{t.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <Badge tone={PRI[t.priority]?.tone ?? "neutral"}>{PRI[t.priority]?.label}</Badge>
          <span>Ответственный: <b className="text-ink">{t.assigneeName}</b></span><span>· поставил {t.creatorName}</span>
          {t.dueAt && <span className={cn(!t.completedAt && new Date(t.dueAt) < new Date() && "font-semibold text-danger")}>· срок {fmtDate(t.dueAt, true)}</span>}
        </div>
        {t.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{t.tags.map((g) => <span key={g} className="rounded-md bg-surface-2 px-1.5 text-xs">#{g}</span>)}</div>}
      </div>
      {t.description && <p className="whitespace-pre-wrap text-sm">{t.description}</p>}
      {t.attachments.length > 0 && <FileList files={t.attachments} />}
      {(t.orderId || t.counterpartyId || t.leadId) && <div className="flex flex-wrap gap-2 text-sm">
        {t.orderId && <Link href={`/orders/${t.orderId}`} className="rounded-lg border border-line px-2 py-1 hover:bg-surface-2">Заявка</Link>}
        {t.counterpartyId && <Link href={`/counterparties/${t.counterpartyId}`} className="rounded-lg border border-line px-2 py-1 hover:bg-surface-2">Контрагент</Link>}
        {t.leadId && <Link href={`/pipeline?open=${t.leadId}`} className="rounded-lg border border-line px-2 py-1 hover:bg-surface-2">Сделка</Link>}
      </div>}
      {canEdit && <div className="flex gap-2">
        <Button size="sm" onClick={() => setEdit(true)}>Изменить</Button>
        <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} loading={del.pending} onClick={() => confirm("Удалить задачу?") && del.run(() => deleteTaskAction({ id }), { success: "Задача удалена", onOk: onClose })}>Удалить</Button>
      </div>}
      <section className="border-t border-line pt-4">
        <h4 className="mb-3 text-sm font-bold">Комментарии · {t.comments.length}</h4>
        <ul className="flex flex-col gap-3">
          {t.comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <Avatar name={c.authorName} color={c.authorColor} size={30} />
              <div className="min-w-0 flex-1">
                <p className="text-xs"><b>{c.authorName}</b> <span className="text-ink-3">{fmtRelative(c.createdAt)}</span></p>
                {c.body && <p className="whitespace-pre-wrap text-sm">{highlight(c.body)}</p>}
                {c.attachments.length > 0 && <FileList files={c.attachments} />}
              </div>
            </li>
          ))}
        </ul>
        <CommentBox id={id} people={people} onSent={load} />
      </section>
    </div>
  );
}

function highlight(body: string) {
  return body.split(/(@[\p{L}]+(?:\s[\p{Lu}][\p{L}]+)?)/u).map((s, i) => (s.startsWith("@") ? <b key={i} className="text-info">{s}</b> : s));
}

function FileList({ files }: { files: FileRef[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {files.map((f) => f.mime.startsWith("image/")
        // eslint-disable-next-line @next/next/no-img-element
        ? <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${f.id}`} alt={f.name} loading="lazy" className="size-20 rounded-lg border border-line object-cover" /></a>
        : <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs hover:bg-surface-2"><Paperclip className="size-3.5" />{f.name}</a>)}
    </div>
  );
}

function CommentBox({ id, people, onSent }: { id: number; people: Person[]; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const ref = useRef<HTMLTextAreaElement>(null);
  const { pending, run } = useRun();
  // @упоминания: подсказка по последнему слову после @
  const m = /@([\p{L}]*)$/u.exec(body);
  const sugg = m ? people.filter((p) => p.name.toLowerCase().startsWith(m[1].toLowerCase())).slice(0, 5) : [];
  const send = () => run(() => commentTaskAction({ id, body, attachments: files }), { refresh: false, onOk: () => { setBody(""); setFiles([]); onSent(); } });
  return (
    <div className="relative mt-4 flex flex-col gap-2">
      {sugg.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 flex flex-col rounded-xl border border-line bg-surface p-1 shadow-lg">
          {sugg.map((p) => <button key={p.id} type="button" className="rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => { setBody(body.replace(/@[\p{L}]*$/u, `@${p.name.split(" ")[0]} `)); ref.current?.focus(); }}>{p.name}</button>)}
        </div>
      )}
      <Textarea ref={ref} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Комментарий… @имя — упомянуть" className="min-h-20"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && (body.trim() || files.length)) send(); }} />
      <div className="flex items-center justify-between gap-2">
        <Attachments value={files} onChange={setFiles} label="Файл" />
        <Button variant="primary" size="sm" icon={<Send className="size-4" />} loading={pending} disabled={!body.trim() && !files.length} onClick={send}>Отправить</Button>
      </div>
    </div>
  );
}

export function useToastOnce(msg: string | null) { useEffect(() => { if (msg) toast(msg); }, [msg]); }
