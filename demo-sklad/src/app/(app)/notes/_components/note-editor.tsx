"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Pin, Trash2, Users } from "lucide-react";
import { Button, Checkbox, Field, Input, Select, Textarea, cn } from "@/components/ui";
import { Attachments, type FileRef } from "@/components/file-upload";
import { useRun } from "@/components/use-run";
import { deleteNoteAction, saveNoteAction } from "@/modules/notes/actions";

export type NoteData = { id: number | null; title: string; body: string; folder: string; tags: string[]; pinned: boolean; visibility: "all" | "selected" | "private"; visibleTo: number[]; attachments: FileRef[] };

export function NoteEditor({ note, people, folders, readOnly }: { note: NoteData; people: { id: number; name: string }[]; folders: string[]; readOnly: boolean }) {
  const router = useRouter();
  const [n, setN] = useState(note);
  const [tags, setTags] = useState(note.tags.join(", "));
  const { pending, run } = useRun();
  const save = () => run(() => saveNoteAction({ id: n.id, data: { ...n, tags: tags.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean) } }),
    { success: "Заметка сохранена", onOk: (r) => { if (!n.id) router.replace(`/notes?id=${r.id}`); } });
  if (readOnly) return (
    <article className="flex flex-col gap-3">
      <h2 className="text-xl font-bold">{n.title}</h2>
      {n.tags.length > 0 && <div className="flex flex-wrap gap-1">{n.tags.map((t) => <span key={t} className="rounded-md bg-surface-2 px-1.5 text-xs">#{t}</span>)}</div>}
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{n.body}</div>
      {n.attachments.length > 0 && <div className="flex flex-wrap gap-2">{n.attachments.map((f) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2 py-1 text-xs hover:bg-surface-2">{f.name}</a>)}</div>}
    </article>
  );
  return (
    <div className="flex flex-col gap-4">
      <Input value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} placeholder="Заголовок" className="text-lg font-bold" autoFocus={!n.id} />
      <Textarea value={n.body} onChange={(e) => setN({ ...n, body: e.target.value })} placeholder="Текст заметки: регламенты, реквизиты, договорённости…" className="min-h-[300px] leading-relaxed"
        onKeyDown={(e) => { if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Папка"><Input list="note-folders" value={n.folder} onChange={(e) => setN({ ...n, folder: e.target.value })} placeholder="Без папки" /><datalist id="note-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></Field>
        <Field label="Теги" hint="через запятую"><Input value={tags} onChange={(e) => setTags(e.target.value)} /></Field>
        <Field label="Кто видит">
          <Select value={n.visibility} onChange={(e) => setN({ ...n, visibility: e.target.value as "all" })}>
            <option value="all">Все сотрудники</option><option value="selected">Выбранные</option><option value="private">Только я</option>
          </Select>
        </Field>
      </div>
      {n.visibility === "selected" && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-line p-3">
          <Users className="size-4 text-ink-3" />
          {people.map((p) => <Checkbox key={p.id} label={p.name} checked={n.visibleTo.includes(p.id)} onChange={(v) => setN({ ...n, visibleTo: v ? [...n.visibleTo, p.id] : n.visibleTo.filter((x) => x !== p.id) })} />)}
        </div>
      )}
      <Attachments value={n.attachments} onChange={(v) => setN({ ...n, attachments: v })} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="accent" loading={pending} disabled={!n.title.trim()} onClick={save}>Сохранить</Button>
        <Button variant="ghost" icon={<Pin className={cn("size-4", n.pinned && "fill-current text-yellow")} />} onClick={() => setN({ ...n, pinned: !n.pinned })}>{n.pinned ? "Закреплена" : "Закрепить"}</Button>
        {n.visibility === "private" && <span className="flex items-center gap-1 text-xs text-ink-3"><Lock className="size-3.5" />личная</span>}
        {n.id && <Button variant="ghost" className="ml-auto" icon={<Trash2 className="size-4" />} onClick={() => confirm("Удалить заметку?") && run(() => deleteNoteAction({ id: n.id! }), { success: "Удалена", onOk: () => router.replace("/notes") })}>Удалить</Button>}
      </div>
    </div>
  );
}
