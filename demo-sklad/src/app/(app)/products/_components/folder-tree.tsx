"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Modal, Select, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { deleteFolderAction, saveFolderAction } from "@/modules/products/actions";

type F = { id: number; name: string; parentId: number | null; count: number };

export function FolderTree({ folders, active, edit, q }: { folders: F[]; active: number | null; edit: boolean; q?: string }) {
  const router = useRouter();
  const children = useMemo(() => {
    const m = new Map<number | null, F[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    return m;
  }, [folders]);
  const ancestors = useMemo(() => {
    const s = new Set<number>();
    let cur = folders.find((f) => f.id === active);
    while (cur) { s.add(cur.id); const pid = cur.parentId; cur = folders.find((f) => f.id === pid); }
    return s;
  }, [folders, active]);
  const [open, setOpen] = useState<Set<number>>(ancestors);
  const [editing, setEditing] = useState<{ id?: number; name: string; parentId: number | null } | null>(null);
  const { pending, run } = useRun();
  const total = (id: number): number => (folders.find((f) => f.id === id)?.count ?? 0) + (children.get(id) ?? []).reduce((s, c) => s + total(c.id), 0);
  const href = (id: number | null) => {
    const s = new URLSearchParams();
    if (id) s.set("folder", String(id));
    if (q) s.set("q", q);
    const r = s.toString();
    return r ? `/products?${r}` : "/products";
  };
  const path = (id: number): string => { const f = folders.find((x) => x.id === id); return f ? (f.parentId ? `${path(f.parentId)} / ${f.name}` : f.name) : ""; };

  const node = (f: F, depth: number): React.ReactNode => {
    const kids = children.get(f.id) ?? [];
    const isOpen = open.has(f.id);
    return (
      <li key={f.id}>
        <div className={cn("group flex h-10 items-center rounded-xl pr-1 transition-colors", active === f.id ? "bg-yellow-50 text-navy dark:bg-white/10 dark:text-yellow" : "hover:bg-surface-2")} style={{ paddingLeft: depth * 14 }}>
          <button type="button" aria-label={isOpen ? "Свернуть" : "Развернуть"} onClick={() => { const n = new Set(open); if (isOpen) n.delete(f.id); else n.add(f.id); setOpen(n); }}
            className={cn("grid size-8 shrink-0 place-items-center text-ink-3", !kids.length && "invisible")}>
            <ChevronRight className={cn("size-4 transition-transform duration-200", isOpen && "rotate-90")} />
          </button>
          <Link href={href(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold">
            {active === f.id ? <FolderOpen className="size-4 shrink-0" /> : <Folder className="size-4 shrink-0 text-ink-3" />}
            <span className="truncate">{f.name}</span>
            <span className="tnum ml-auto text-xs font-medium text-ink-3">{total(f.id)}</span>
          </Link>
          {edit && (
            <button className="ml-1 hidden size-7 place-items-center rounded-lg text-ink-3 hover:bg-surface hover:text-ink group-hover:grid" aria-label="Изменить папку"
              onClick={() => setEditing({ id: f.id, name: f.name, parentId: f.parentId })}><Pencil className="size-3.5" /></button>
          )}
        </div>
        {kids.length > 0 && isOpen && <ul>{kids.map((k) => node(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <div className="flex gap-2 lg:hidden">
        <Select value={active ?? ""} onChange={(e) => router.push(href(e.target.value ? Number(e.target.value) : null))} className="flex-1" aria-label="Папка">
          <option value="">Все товары</option>
          {folders.map((f) => <option key={f.id} value={f.id}>{path(f.id)}</option>)}
        </Select>
        {edit && <Button size="icon" aria-label="Новая папка" onClick={() => setEditing({ name: "", parentId: active })}><FolderPlus className="size-5" /></Button>}
      </div>
      <Card className="hidden self-start p-2 lg:sticky lg:top-20 lg:block">
        <div className="flex items-center justify-between px-2 pb-1 pt-1">
          <p className="text-xs font-bold uppercase tracking-wider text-ink-3">Папки</p>
          {edit && <Button variant="ghost" size="icon-sm" aria-label="Новая папка" onClick={() => setEditing({ name: "", parentId: active })}><FolderPlus className="size-4" /></Button>}
        </div>
        <Link href={href(null)} className={cn("flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", active == null ? "bg-yellow-50 text-navy dark:bg-white/10 dark:text-yellow" : "hover:bg-surface-2")}>
          Все товары<span className="tnum ml-auto text-xs font-medium text-ink-3">{folders.reduce((s, f) => s + f.count, 0)}</span>
        </Link>
        <ul className="mt-0.5">{(children.get(null) ?? []).map((f) => node(f, 0))}</ul>
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Папка" : "Новая папка"} size="sm"
        footer={<>
          {editing?.id && <Button variant="ghost" className="mr-auto text-danger" icon={<Trash2 className="size-4" />} disabled={pending}
            onClick={() => { if (confirm("Удалить папку? Товары и вложенные папки переместятся на уровень выше.")) run(() => deleteFolderAction({ id: editing.id! }), { success: "Папка удалена", onOk: () => { setEditing(null); if (active === editing.id) router.push("/products"); } }); }}>Удалить</Button>}
          <Button onClick={() => setEditing(null)}>Отмена</Button>
          <Button variant="primary" loading={pending} onClick={() => editing && run(() => saveFolderAction(editing), { success: "Сохранено", onOk: () => setEditing(null) })}>Сохранить</Button>
        </>}>
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Название"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus placeholder="Например, Кабель ВВГ" /></Field>
            <Field label="Внутри папки">
              <Select value={editing.parentId ?? ""} onChange={(e) => setEditing({ ...editing, parentId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">— верхний уровень —</option>
                {folders.filter((f) => f.id !== editing.id).map((f) => <option key={f.id} value={f.id}>{path(f.id)}</option>)}
              </Select>
            </Field>
          </div>
        )}
      </Modal>
    </>
  );
}
