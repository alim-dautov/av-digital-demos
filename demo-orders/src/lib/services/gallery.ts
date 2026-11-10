import fs from "fs";
import path from "path";
import { getData, mutateData } from "@/lib/db";
import {
  mediaFileUrl,
  prepareImage,
  randomImageFileName,
  uploadPath,
} from "@/lib/uploads";
import { generateId, nowIso } from "@/lib/utils";
import type { GalleryFolder, GalleryPhoto } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

function folderDir(companyId: string, folderId: string) {
  return uploadPath(companyId, "gallery", folderId);
}

export function listGalleryFolders(companyId: string): (GalleryFolder & { count: number })[] {
  const data = getData();
  return data.galleryFolders
    .filter((f) => f.companyId === companyId)
    .sort((a, b) => Number(b.system) - Number(a.system) || a.createdAt.localeCompare(b.createdAt))
    .map((f) => ({
      ...f,
      count: data.galleryPhotos.filter((p) => p.folderId === f.id).length,
    }));
}

export function listGalleryPhotos(
  companyId: string,
  filter: { folderId?: string; clientId?: string; orderId?: string },
): GalleryPhoto[] {
  return getData()
    .galleryPhotos.filter(
      (p) =>
        p.companyId === companyId &&
        (!filter.folderId || p.folderId === filter.folderId) &&
        (!filter.clientId || p.clientId === filter.clientId) &&
        (!filter.orderId || p.orderId === filter.orderId),
    )
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function createGalleryFolder(companyId: string, name: string): GalleryFolder {
  const clean = name.trim();
  if (!clean) throw new Error("Укажите название папки");
  let folder!: GalleryFolder;
  mutateData((data) => {
    const dup = data.galleryFolders.some(
      (f) => f.companyId === companyId && f.name.toLowerCase() === clean.toLowerCase(),
    );
    if (dup) throw new Error("Папка с таким названием уже есть");
    folder = { id: generateId("gfold"), companyId, name: clean, system: false, createdAt: nowIso() };
    data.galleryFolders.push(folder);
  });
  return folder;
}

export function renameGalleryFolder(companyId: string, id: string, name: string): GalleryFolder {
  const clean = name.trim();
  if (!clean) throw new Error("Укажите название папки");
  let folder!: GalleryFolder;
  mutateData((data) => {
    const f = data.galleryFolders.find((x) => x.id === id && x.companyId === companyId);
    if (!f) throw new Error("Папка не найдена");
    f.name = clean;
    folder = { ...f };
  });
  return folder;
}

export function deleteGalleryFolder(companyId: string, id: string): void {
  mutateData((data) => {
    const exists = data.galleryFolders.some((f) => f.id === id && f.companyId === companyId);
    if (!exists) throw new Error("Папка не найдена");
    data.galleryFolders = data.galleryFolders.filter((f) => f.id !== id);
    data.galleryPhotos = data.galleryPhotos.filter((p) => p.folderId !== id);
  });
  fs.rmSync(folderDir(companyId, id), { recursive: true, force: true });
}

export async function uploadGalleryPhotos(
  companyId: string,
  folderId: string,
  files: File[],
  link: { clientId: string | null; orderId: string | null },
): Promise<GalleryPhoto[]> {
  const data = getData();
  if (!data.galleryFolders.some((f) => f.id === folderId && f.companyId === companyId)) {
    throw new Error("Папка не найдена");
  }
  if (link.clientId && !data.clients.some((c) => c.id === link.clientId && c.companyId === companyId)) {
    throw new Error("Клиент не найден");
  }
  if (link.orderId && !data.orders.some((o) => o.id === link.orderId && o.companyId === companyId && isActiveOrder(o))) {
    throw new Error("Заказ не найден");
  }
  const prepared = [];
  for (const file of files) {
    const image = await prepareImage(file);
    if (!image.ok) throw new Error(image.error);
    prepared.push({ file, image });
  }

  const dir = folderDir(companyId, folderId);
  fs.mkdirSync(dir, { recursive: true });
  const photos: GalleryPhoto[] = [];
  for (const { file, image } of prepared) {
    const filename = randomImageFileName(image.mime);
    fs.writeFileSync(path.join(dir, filename), image.data);
    photos.push({
      id: generateId("gph"),
      companyId,
      folderId,
      url: mediaFileUrl(companyId, "gallery", folderId, filename),
      name: file.name.slice(0, 200),
      clientId: link.clientId,
      orderId: link.orderId,
      createdAt: nowIso(),
    });
  }
  mutateData((d) => {
    d.galleryPhotos.push(...photos);
  });
  return photos;
}

export function updateGalleryPhoto(
  companyId: string,
  id: string,
  patch: { clientId?: string | null; orderId?: string | null },
): GalleryPhoto {
  let photo!: GalleryPhoto;
  mutateData((data) => {
    const p = data.galleryPhotos.find((x) => x.id === id && x.companyId === companyId);
    if (!p) throw new Error("Фото не найдено");
    if (patch.clientId && !data.clients.some((c) => c.id === patch.clientId && c.companyId === companyId)) {
      throw new Error("Клиент не найден");
    }
    if (patch.orderId && !data.orders.some((o) => o.id === patch.orderId && o.companyId === companyId && isActiveOrder(o))) {
      throw new Error("Заказ не найден");
    }
    if (patch.clientId !== undefined) p.clientId = patch.clientId;
    if (patch.orderId !== undefined) p.orderId = patch.orderId;
    photo = { ...p };
  });
  return photo;
}

export function deleteGalleryPhoto(companyId: string, id: string): void {
  let removed: GalleryPhoto | undefined;
  mutateData((data) => {
    removed = data.galleryPhotos.find((p) => p.id === id && p.companyId === companyId);
    data.galleryPhotos = data.galleryPhotos.filter((p) => p !== removed);
  });
  if (!removed) return;
  const file = new URL(removed.url, "http://local").searchParams.get("file");
  if (file) {
    fs.rmSync(path.join(folderDir(companyId, removed.folderId), path.basename(file)), { force: true });
  }
}
