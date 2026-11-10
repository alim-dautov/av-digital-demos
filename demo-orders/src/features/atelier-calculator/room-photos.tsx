"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateId } from "@/lib/utils";
import { deleteMedia, MediaUploadError, uploadMediaFile } from "@/features/shared/upload-media";
import type { MediaItem } from "@/types";

type PendingUpload = {
  key: string;
  name: string;
  previewUrl: string;
  error: string | null;
};

export function RoomPhotos({
  orderId,
  roomId,
  photos,
  canWrite,
  ensureOrder,
  onAdded,
  onRemoved,
}: {
  orderId: string | null;
  roomId: string;
  photos: MediaItem[];
  canWrite: boolean;
  /** `fresh` drops a stale order id (deleted order) and saves the calculation as a new one. */
  ensureOrder: (fresh?: boolean) => Promise<string | null>;
  onAdded: (items: MediaItem[]) => void;
  onRemoved: (id: string) => void;
}) {
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [busy, setBusy] = useState(false);
  const urls = useRef(new Set<string>());

  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, []);

  function dropPending(key: string) {
    setPending((list) => {
      const item = list.find((p) => p.key === key);
      if (item) {
        URL.revokeObjectURL(item.previewUrl);
        urls.current.delete(item.previewUrl);
      }
      return list.filter((p) => p.key !== key);
    });
  }

  async function upload(files: File[]) {
    if (!files.length) return;
    setBusy(true);
    try {
      let entityId = await ensureOrder();
      if (!entityId) {
        toast.error("Сохраните заказ (укажите клиента), чтобы прикрепить фото");
        return;
      }
      const queued = files.map((file) => {
        const previewUrl = URL.createObjectURL(file);
        urls.current.add(previewUrl);
        return { file, item: { key: generateId("up"), name: file.name, previewUrl, error: null } };
      });
      setPending((list) => [...list, ...queued.map((q) => q.item)]);

      let failed = 0;
      let recovered = false;
      for (const { file, item } of queued) {
        try {
          let media: MediaItem;
          try {
            media = await uploadMediaFile(file, { entityType: "order", entityId, roomId });
          } catch (e) {
            if (!(e instanceof MediaUploadError) || e.status !== 404 || recovered) throw e;
            // The calculation points at an order that no longer exists: save it again and retry.
            recovered = true;
            const fresh = await ensureOrder(true);
            if (!fresh) throw e;
            entityId = fresh;
            media = await uploadMediaFile(file, { entityType: "order", entityId, roomId });
          }
          onAdded([media]);
          dropPending(item.key);
        } catch (e) {
          failed += 1;
          const message = e instanceof Error ? e.message : "Ошибка загрузки";
          setPending((list) => list.map((p) => (p.key === item.key ? { ...p, error: message } : p)));
        }
      }
      if (failed === 0) toast.success(files.length > 1 ? `Загружено фото: ${files.length}` : "Фото добавлено");
      else toast.error(`Не загружено: ${failed} из ${files.length}`);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: MediaItem) {
    if (!orderId || !window.confirm("Удалить фото?")) return;
    try {
      await deleteMedia({ entityType: "order", entityId: orderId }, item.id);
      onRemoved(item.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка");
    }
  }

  const empty = photos.length === 0 && pending.length === 0;

  return (
    <div className="space-y-3">
      {empty ? (
        <p className="text-sm text-muted-foreground">
          Фото замера для этой комнаты пока нет. JPG, PNG, WEBP или HEIC до 15 МБ.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p) => (
            <div key={p.id} className="group relative overflow-hidden rounded-lg border border-border">
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
              {canWrite && (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="absolute right-2 top-2"
                  aria-label={`Удалить ${p.name}`}
                  onClick={() => void remove(p)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.key} className="relative overflow-hidden rounded-lg border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.name} className="aspect-[4/3] w-full object-cover opacity-60" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/40 p-2 text-center text-xs">
                {p.error ? (
                  <>
                    <span className="font-medium text-destructive">{p.error}</span>
                    <Button type="button" size="sm" variant="secondary" onClick={() => dropPending(p.key)}>
                      <X className="mr-1 size-3" /> Убрать
                    </Button>
                  </>
                ) : (
                  <Loader2 className="size-5 animate-spin" aria-label="Загрузка" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <PickButton busy={busy} onFiles={upload} icon={<ImagePlus className="mr-1 size-4" />}>
            Добавить фото
          </PickButton>
          <PickButton busy={busy} onFiles={upload} capture icon={<Camera className="mr-1 size-4" />} className="sm:hidden">
            Снять
          </PickButton>
        </div>
      )}
    </div>
  );
}

function PickButton({
  busy,
  onFiles,
  capture,
  icon,
  className,
  children,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
  capture?: boolean;
  icon: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`touch-manipulation inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-md border border-border px-4 text-base transition-none active:bg-foreground/10 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${className ?? ""}`}
    >
      <input
        type="file"
        accept="image/*"
        multiple={!capture}
        capture={capture ? "environment" : undefined}
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          onFiles(files);
        }}
      />
      {busy ? <Loader2 className="mr-1 size-4 animate-spin" /> : icon}
      {children}
    </label>
  );
}
