import type { MediaItem } from "@/types";

export const MAX_UPLOAD_MB = 15;

export type MediaTarget = {
  entityType: "client" | "order";
  entityId: string;
  roomId?: string | null;
};

/** Upload error that keeps the HTTP status, so callers can recover from a missing record. */
export class MediaUploadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "MediaUploadError";
  }
}

/** Uploads one image; resolves to the stored item or throws a user-facing message. */
export async function uploadMediaFile(file: File, target: MediaTarget): Promise<MediaItem> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`«${file.name}» больше ${MAX_UPLOAD_MB} МБ`);
  }
  const fd = new FormData();
  fd.set("file", file);
  fd.set("entityType", target.entityType);
  fd.set("entityId", target.entityId);
  if (target.roomId) fd.set("roomId", target.roomId);

  let res: Response;
  try {
    res = await fetch("/api/media", { method: "POST", body: fd });
  } catch {
    throw new MediaUploadError(`«${file.name}»: нет связи с сервером`, null);
  }
  const data = (await res.json().catch(() => null)) as
    | { media?: MediaItem; error?: string }
    | null;
  if (!res.ok || !data?.media) {
    throw new MediaUploadError(
      data?.error || `«${file.name}»: ошибка загрузки (${res.status})`,
      res.status,
    );
  }
  return data.media;
}

export async function deleteMedia(target: MediaTarget, mediaId: string): Promise<void> {
  const res = await fetch("/api/media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType: target.entityType, entityId: target.entityId, mediaId }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error || "Не удалось удалить фото");
  }
}
