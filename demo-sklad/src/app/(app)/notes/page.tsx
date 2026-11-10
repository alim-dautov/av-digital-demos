import Link from "next/link";
import { FileText, Folder, Pin, Plus, Search } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtRelative } from "@/lib/format";
import { Card, EmptyState, Input, PageHeader, buttonClass, cn } from "@/components/ui";
import { getNote, listNotes } from "@/modules/notes/service";
import { activeUsers } from "@/modules/counterparties/service";
import { NoteEditor } from "./_components/note-editor";

export const metadata = { title: "Заметки" };
type SP = { q?: string; folder?: string; tag?: string; id?: string };

export default async function NotesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("notes");
  const sp = await searchParams;
  const db = await getDb();
  const list = await listNotes(db, u, { q: sp.q, folder: sp.folder, tag: sp.tag });
  const people = (await activeUsers(db)).filter((x) => x.id !== u.id).map((x) => ({ id: x.id, name: x.name }));
  const full = can(u, "notes", "full");
  const sel = sp.id === "new" ? "new" : sp.id ? await getNote(db, u, Number(sp.id)).catch(() => null) : null;
  const qs = (o: Partial<SP>) => `/notes?${new URLSearchParams(Object.entries({ ...sp, ...o }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <>
      <PageHeader title="Заметки" subtitle="база знаний команды: регламенты, реквизиты, договорённости"
        actions={full && <Link href={qs({ id: "new" })} className={buttonClass("primary")}><Plus className="size-4" />Заметка</Link>} />
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className={cn("flex min-w-0 flex-col gap-3", sel && "hidden lg:flex")}>
          <form action="/notes"><Input name="q" defaultValue={sp.q} placeholder="Поиск по заметкам" icon={<Search />} type="search" /></form>
          {list.folders.length > 0 && (
            <div className="scroll-thin flex gap-1.5 overflow-x-auto pb-1">
              <Link href={qs({ folder: undefined, id: undefined })} className={cn("shrink-0 rounded-full border px-3 py-1 text-xs font-semibold", !sp.folder ? "border-yellow bg-yellow/15" : "border-line")}>Все</Link>
              {list.folders.map((f) => <Link key={f} href={qs({ folder: f, id: undefined })} className={cn("flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold", sp.folder === f ? "border-yellow bg-yellow/15" : "border-line")}><Folder className="size-3" />{f}</Link>)}
            </div>
          )}
          <Card className="overflow-hidden">
            {list.rows.length ? (
              <ul className="divide-y divide-line">
                {list.rows.map((n) => (
                  <li key={n.id}>
                    <Link href={qs({ id: String(n.id) })} className={cn("block px-4 py-3 hover:bg-surface-2", sp.id === String(n.id) && "bg-yellow/10")}>
                      <p className="flex items-center gap-1.5 text-sm font-semibold">{n.pinned && <Pin className="size-3.5 shrink-0 fill-current text-yellow" />}<span className="truncate">{n.title}</span></p>
                      <p className="line-clamp-2 text-xs text-ink-3">{n.body.slice(0, 160) || "—"}</p>
                      <p className="mt-1 text-[11px] text-ink-3">{n.authorName} · {fmtRelative(n.updatedAt)}{n.folder && ` · ${n.folder}`}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={<FileText />} title="Заметок нет" />}
          </Card>
        </div>
        <div className={cn("min-w-0", !sel && "hidden lg:block")}>
          {sel ? (
            <Card className="p-4 sm:p-5">
              <Link href={qs({ id: undefined })} className="mb-3 inline-block text-sm font-semibold text-info lg:hidden">← К списку</Link>
              <NoteEditor key={sel === "new" ? "new" : sel.id} people={people} folders={list.folders} readOnly={sel !== "new" && (!full || (sel.authorId !== u.id && !u.isOwner))}
                note={sel === "new" ? { id: null, title: "", body: "", folder: sp.folder ?? "", tags: [], pinned: false, visibility: "all", visibleTo: [], attachments: [] }
                  : { id: sel.id, title: sel.title, body: sel.body, folder: sel.folder, tags: sel.tags, pinned: sel.pinned, visibility: sel.visibility as "all", visibleTo: sel.visibleTo, attachments: sel.attachments }} />
            </Card>
          ) : <Card className="p-10"><EmptyState icon={<FileText />} title="Выберите заметку" text="или создайте новую" /></Card>}
        </div>
      </div>
    </>
  );
}
