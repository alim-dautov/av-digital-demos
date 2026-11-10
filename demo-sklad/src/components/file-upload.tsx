"use client";
import { useRef, useState } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/components/ui";

export type FileRef = { id: number; name: string; mime: string; size: number };

export async function uploadFile(file: File): Promise<FileRef> {
  const fd = new FormData();
  fd.set("file", file);
  const r = await fetch("/api/files", { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Не удалось загрузить файл");
  return j as FileRef;
}

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

/** Вложения: список + кнопка «Прикрепить». Картинки показываются превью. */
export function Attachments({ value, onChange, accept, images, max = 10, label = "Прикрепить файл" }: {
  value: FileRef[]; onChange: (v: FileRef[]) => void; accept?: string; images?: boolean; max?: number; label?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const add = async (list: FileList | null) => {
    if (!list) return;
    const arr = [...list].slice(0, Math.max(0, max - value.length));
    setBusy(arr.length);
    const out: FileRef[] = [];
    for (const f of arr) {
      try { out.push(await uploadFile(f)); } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`); }
      setBusy((b) => b - 1);
    }
    onChange([...value, ...out]);
    if (ref.current) ref.current.value = "";
  };
  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className={cn(images ? "grid grid-cols-3 gap-2 sm:grid-cols-4" : "flex flex-col gap-1.5")}>
          {value.map((f) => images && f.mime.startsWith("image/") ? (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${f.id}`} alt={f.name} loading="lazy" className="size-full object-cover" />
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== f.id))} aria-label="Убрать" className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" /></button>
            </div>
          ) : (
            <div key={f.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm">
              <FileText className="size-4 shrink-0 text-ink-3" />
              <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-medium hover:underline">{f.name}</a>
              <span className="text-xs text-ink-3">{kb(f.size)}</span>
              <button type="button" onClick={() => onChange(value.filter((x) => x.id !== f.id))} aria-label="Убрать" className="grid size-8 place-items-center rounded-lg text-ink-3 hover:bg-surface-2"><X className="size-4" /></button>
            </div>
          ))}
        </div>
      )}
      {value.length < max && (
        <button type="button" onClick={() => ref.current?.click()} disabled={busy > 0}
          className="inline-flex h-11 items-center gap-2 self-start rounded-xl border border-dashed border-line-strong px-3 text-sm font-semibold text-ink-2 transition-colors hover:border-yellow hover:text-ink">
          {busy > 0 ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}{busy > 0 ? `Загрузка (${busy})…` : label}
        </button>
      )}
      <input ref={ref} type="file" multiple hidden accept={accept ?? (images ? "image/*" : undefined)} onChange={(e) => add(e.target.files)} />
    </div>
  );
}
