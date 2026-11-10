import { mutateData } from "@/lib/db";
import { generateId } from "@/lib/utils";
import type { AppData, MediaItem } from "@/types";

/** Copies order or measurement photos onto the client card without duplicating the file. */
export function copyPhotosOntoClient(
  data: AppData,
  companyId: string,
  clientId: string,
  photos: MediaItem[],
) {
  const client = data.clients.find((c) => c.id === clientId && c.companyId === companyId);
  if (!client || photos.length === 0) return;
  if (!client.photos) client.photos = [];
  const linked = new Set(
    client.photos.map((p) => p.sourceMediaId).filter((id): id is string => Boolean(id)),
  );
  const urls = new Set(client.photos.map((p) => p.url));
  for (const photo of photos) {
    if (photo.type !== "photo") continue;
    if (linked.has(photo.id) || urls.has(photo.url)) continue;
    client.photos.push({
      id: generateId("media"),
      type: "photo",
      url: photo.url,
      name: photo.name,
      createdAt: photo.createdAt,
      roomId: photo.roomId ?? null,
      sourceMediaId: photo.id,
    });
    linked.add(photo.id);
    urls.add(photo.url);
  }
}

export function unlinkClientPhotos(
  data: AppData,
  companyId: string,
  clientId: string,
  sourceMediaId: string,
) {
  const client = data.clients.find((c) => c.id === clientId && c.companyId === companyId);
  if (!client?.photos) return;
  client.photos = client.photos.filter((p) => p.sourceMediaId !== sourceMediaId);
}

/** Backfill the client card from orders and measurement sheets already saved. */
export function syncClientCardPhotos(companyId: string, clientId: string) {
  mutateData((data) => {
    for (const order of data.orders) {
      if (order.companyId === companyId && order.clientId === clientId) {
        copyPhotosOntoClient(data, companyId, clientId, order.media);
      }
    }
    for (const measurement of data.clientMeasurements ?? []) {
      if (measurement.companyId !== companyId || measurement.clientId !== clientId) continue;
      copyPhotosOntoClient(
        data,
        companyId,
        clientId,
        measurement.photos.map((photo) => ({
          id: photo.id,
          type: "photo" as const,
          url: photo.url,
          name: photo.name,
          createdAt: photo.createdAt,
        })),
      );
    }
  });
}
