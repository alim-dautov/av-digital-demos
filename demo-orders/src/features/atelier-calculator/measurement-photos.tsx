"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ClientMeasurementPhoto } from "@/types";

export function MeasurementPhotos({
  measurementId,
  photos,
  canWrite,
}: {
  measurementId: string;
  photos: ClientMeasurementPhoto[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const body = new FormData();
    body.set("measurementId", measurementId);
    for (const file of list) body.append("files", file);
    setPending(true);
    try {
      const res = await fetch("/api/atelier/measurements/photos", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось сохранить фото");
      toast.success("Фото замера сохранены");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(photoId: string) {
    setPending(true);
    try {
      const res = await fetch(
        `/api/atelier/measurements/photos?measurementId=${encodeURIComponent(measurementId)}&photoId=${encodeURIComponent(photoId)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не удалось удалить фото");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      {canWrite ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="sr-only"
            onChange={(event) => void upload(event.target.files)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="size-4" />
            Фото замера
          </Button>
        </>
      ) : null}
      {canWrite && photos.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <li key={photo.id}>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void remove(photo.id)}
              >
                <Trash2 className="size-4" />
                {photo.name}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
