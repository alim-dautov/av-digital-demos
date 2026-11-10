import { randomBytes } from "crypto";
import path from "path";

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const IMAGE_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export const UPLOADS_ROOT = path.join(process.cwd(), "data", "uploads");

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Image type from the file signature; phones often send an empty or wrong `type`. */
export function detectImageType(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "image/heic" | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("ascii", 4, 8) === "ftyp" && HEIF_BRANDS.has(buf.toString("ascii", 8, 12))) {
    return "image/heic";
  }
  return null;
}

/** Bytes and MIME ready to store: HEIC/HEIF is re-encoded as JPEG so every browser can show it. */
export async function prepareImage(
  file: File,
): Promise<{ ok: true; data: Buffer; mime: string } | { ok: false; error: string }> {
  if (file.size === 0) return { ok: false, error: `«${file.name}»: пустой файл` };
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: `«${file.name}» больше ${MAX_IMAGE_BYTES / 1024 / 1024} МБ` };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = detectImageType(buf);
  if (!mime) {
    return { ok: false, error: `«${file.name}»: поддерживаются JPG, PNG, WEBP, GIF, HEIC` };
  }
  if (mime !== "image/heic") return { ok: true, data: buf, mime };
  try {
    const { default: convert } = await import("heic-convert");
    const jpeg = await convert({ buffer: buf, format: "JPEG", quality: 0.85 });
    return { ok: true, data: Buffer.from(jpeg), mime: "image/jpeg" };
  } catch {
    return { ok: false, error: `«${file.name}»: не удалось преобразовать HEIC, сохраните фото как JPG` };
  }
}

export function randomImageFileName(mime: string): string {
  return `${Date.now()}_${randomBytes(8).toString("hex")}${IMAGE_EXT_BY_MIME[mime] ?? ".bin"}`;
}

export function contentTypeForFile(file: string): string | null {
  return MIME_BY_EXT[path.extname(file).toLowerCase()] ?? null;
}

/** Путь в каталоге загрузок; каждый сегмент обрезается до basename. */
export function uploadPath(...segments: string[]): string {
  return path.join(UPLOADS_ROOT, ...segments.map((s) => path.basename(s)));
}

export function mediaFileUrl(
  companyId: string,
  entityType: string,
  entityId: string,
  file: string,
): string {
  const q = new URLSearchParams({ companyId, entityType, entityId, file });
  return `/api/media/file?${q.toString()}`;
}
