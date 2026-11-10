"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDateRu } from "@/lib/utils";
import { deleteMedia, uploadMediaFile } from "@/features/shared/upload-media";
import type { EntityNote, MediaItem } from "@/types";

export function FilesAndNotes({
  entityType,
  entityId,
  photos,
  notes,
  canWrite,
  roomNames,
}: {
  entityType: "client" | "order";
  entityId: string;
  photos: MediaItem[];
  notes: EntityNote[];
  canWrite: boolean;
  /** Atelier room id → name, to caption room photos */
  roomNames?: Map<string, string>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setPending(true);
    const errors: string[] = [];
    let added = 0;
    for (const file of files) {
      try {
        await uploadMediaFile(file, { entityType, entityId });
        added += 1;
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Ошибка загрузки");
      }
    }
    if (added) toast.success(added > 1 ? `Загружено фото: ${added}` : "Фото добавлено");
    for (const message of errors) toast.error(message);
    setPending(false);
    if (added) router.refresh();
  }

  async function removePhoto(mediaId: string) {
    setPending(true);
    try {
      await deleteMedia({ entityType, entityId }, mediaId);
      toast.success("Удалено");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  async function addNote() {
    if (!text.trim()) return;
    setPending(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Ошибка");
      setText("");
      toast.success("Заметка сохранена");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold">Фотографии</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => {
            const room = p.roomId ? roomNames?.get(p.roomId) : undefined;
            return (
              <div
                key={p.id}
                className="relative overflow-hidden rounded-lg border border-border"
              >
                <a href={p.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.name}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                </a>
                {room && (
                  <span className="absolute bottom-2 left-2 rounded-sm bg-background/85 px-1.5 py-0.5 text-xs">
                    {room}
                  </span>
                )}
                {canWrite && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2"
                    disabled={pending}
                    onClick={() => void removePhoto(p.id)}
                  >
                    Удалить
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        {canWrite && (
          <label className="mt-3 inline-flex cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={pending}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void upload(files);
              }}
            />
            <span className="touch-manipulation flex min-h-14 w-full items-center justify-center rounded-md border border-border px-4 text-base active:bg-foreground/10">
              {pending ? "Загрузка…" : "Добавить фото"}
            </span>
          </label>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold">Заметки</h3>
        <ul className="mt-3 space-y-2">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <p>{n.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {n.authorName ?? "—"} · {formatDateRu(n.updatedAt)}
              </p>
            </li>
          ))}
          {notes.length === 0 && (
            <p className="text-sm text-muted-foreground">Заметок пока нет</p>
          )}
        </ul>
        {canWrite && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Новая заметка…"
              rows={3}
            />
            <Button
              type="button"
              className="w-full"
              disabled={pending || !text.trim()}
              onClick={() => void addNote()}
            >
              Добавить заметку
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
