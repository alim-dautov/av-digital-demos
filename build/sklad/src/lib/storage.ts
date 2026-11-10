/**
 * Абстракция хранилища файлов. Сейчас — локальная папка (STORAGE_LOCAL_DIR).
 * Для S3 реализуйте StorageDriver (put/get/remove) и выберите STORAGE_DRIVER=s3.
 */
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";

export interface StorageDriver {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private p(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root))) throw new Error("bad key");
    return full;
  }
  async put(key: string, data: Buffer) {
    const f = this.p(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, data);
  }
  async get(key: string) {
    try { return await readFile(this.p(key)); } catch { return null; }
  }
  async remove(key: string) { await unlink(this.p(key)).catch(() => {}); }
}

class S3Driver implements StorageDriver {
  // Заготовка: подключите @aws-sdk/client-s3 и реализуйте методы.
  async put(): Promise<void> { throw new Error("S3 не настроен"); }
  async get(): Promise<Buffer | null> { throw new Error("S3 не настроен"); }
  async remove(): Promise<void> { throw new Error("S3 не настроен"); }
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  if (!driver) driver = process.env.STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver(process.env.STORAGE_LOCAL_DIR ?? path.join(process.cwd(), "uploads"));
  return driver;
}
export function newKey(name: string) {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const d = new Date();
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${randomBytes(12).toString("hex")}${ext}`;
}
export const ALLOWED_MIME = /^(image\/(png|jpe?g|webp|gif|heic)|application\/pdf|application\/vnd\.openxmlformats-officedocument\.(spreadsheetml\.sheet|wordprocessingml\.document)|application\/msword|application\/vnd\.ms-excel|text\/plain|text\/csv)$/;
