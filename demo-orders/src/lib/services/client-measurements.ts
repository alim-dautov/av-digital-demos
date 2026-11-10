import fs from "fs";
import path from "path";
import { getData, mutateData } from "@/lib/db";
import { copyPhotosOntoClient } from "@/lib/services/client-photos";
import { createClient } from "@/lib/services/clients";
import {
  mediaFileUrl,
  prepareImage,
  randomImageFileName,
  uploadPath,
} from "@/lib/uploads";
import { generateId, nowIso } from "@/lib/utils";
import type { ClientMeasurement, ClientMeasurementPhoto, AtelierQuoteSnapshot } from "@/types";

function measurementDir(companyId: string, measurementId: string) {
  return uploadPath(companyId, "measurement", measurementId);
}

function nextNumber(companyId: string): string {
  const year = new Date().getFullYear();
  const prefix = `ЗМ-${year}-`;
  const nums = getData()
    .clientMeasurements.filter(
      (m) => m.companyId === companyId && m.number.startsWith(prefix),
    )
    .map((m) => Number(m.number.slice(prefix.length)))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

/** Uses the chosen client, or creates one from the name typed at the start. */
export function ensureMeasurementClient(
  companyId: string,
  quote: AtelierQuoteSnapshot,
): { id: string; fullName: string } {
  const data = getData();
  if (quote.clientId) {
    const existing = data.clients.find(
      (c) => c.id === quote.clientId && c.companyId === companyId,
    );
    if (!existing) throw new Error("Клиент не найден");
    if (quote.address?.trim() && !existing.address) {
      mutateData((draft) => {
        const client = draft.clients.find((c) => c.id === existing.id);
        if (client && !client.address) client.address = quote.address.trim();
      });
    }
    return { id: existing.id, fullName: existing.fullName };
  }

  const fullName = quote.clientName.trim();
  if (!fullName) throw new Error("Укажите клиента");
  const created = createClient(companyId, {
    fullName,
    phone: quote.clientPhone.trim() || "—",
    source: "other",
    address: quote.address.trim() || null,
    comment: "Создан из калькулятора замера",
  });
  return { id: created.id, fullName: created.fullName };
}

export function listClientMeasurements(
  companyId: string,
  clientId?: string,
): ClientMeasurement[] {
  return getData()
    .clientMeasurements.filter(
      (m) => m.companyId === companyId && (!clientId || m.clientId === clientId),
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getClientMeasurement(
  companyId: string,
  id: string,
): ClientMeasurement | null {
  return (
    getData().clientMeasurements.find((m) => m.id === id && m.companyId === companyId) ??
    null
  );
}

export function saveClientMeasurement(
  companyId: string,
  input: {
    id?: string | null;
    quote: AtelierQuoteSnapshot;
    kind: ClientMeasurement["kind"];
  },
): ClientMeasurement {
  const client = ensureMeasurementClient(companyId, input.quote);
  const quote: AtelierQuoteSnapshot = {
    ...input.quote,
    clientId: client.id,
    clientName: input.quote.clientName.trim() || client.fullName,
  };
  const now = nowIso();
  let saved!: ClientMeasurement;

  mutateData((data) => {
    if (!data.clientMeasurements) data.clientMeasurements = [];
    const current = input.id
      ? data.clientMeasurements.find((m) => m.id === input.id && m.companyId === companyId)
      : undefined;
    if (input.id && !current) throw new Error("Замер не найден");
    if (current) {
      current.clientId = client.id;
      current.address = quote.address.trim();
      current.quote = quote;
      current.kind = input.kind === "sheet" ? "sheet" : current.kind;
      current.updatedAt = now;
      saved = { ...current, photos: [...current.photos] };
      return;
    }
    const created: ClientMeasurement = {
      id: generateId("cmeas"),
      companyId,
      clientId: client.id,
      number: nextNumber(companyId),
      address: quote.address.trim(),
      quote,
      kind: input.kind,
      photos: [],
      createdAt: now,
      updatedAt: now,
    };
    data.clientMeasurements.push(created);
    saved = created;
  });

  return saved;
}

export async function addMeasurementPhotos(
  companyId: string,
  measurementId: string,
  files: File[],
): Promise<ClientMeasurement> {
  const current = getClientMeasurement(companyId, measurementId);
  if (!current) throw new Error("Замер не найден");
  if (files.length === 0) throw new Error("Выберите фото");
  if (current.photos.length + files.length > 30) {
    throw new Error("Не больше 30 фото на один замер");
  }
  const prepared = [];
  for (const file of files) {
    const image = await prepareImage(file);
    if (!image.ok) throw new Error(image.error);
    prepared.push({ file, image });
  }

  const dir = measurementDir(companyId, measurementId);
  fs.mkdirSync(dir, { recursive: true });
  const photos: ClientMeasurementPhoto[] = [];
  for (const { file, image } of prepared) {
    const filename = randomImageFileName(image.mime);
    fs.writeFileSync(path.join(dir, filename), image.data);
    photos.push({
      id: generateId("mph"),
      name: file.name.slice(0, 200),
      url: mediaFileUrl(companyId, "measurement", measurementId, filename),
      createdAt: nowIso(),
    });
  }

  let saved!: ClientMeasurement;
  mutateData((data) => {
    const row = data.clientMeasurements.find(
      (m) => m.id === measurementId && m.companyId === companyId,
    );
    if (!row) throw new Error("Замер не найден");
    row.photos.push(...photos);
    row.updatedAt = nowIso();
    copyPhotosOntoClient(
      data,
      companyId,
      row.clientId,
      photos.map((photo) => ({
        id: photo.id,
        type: "photo" as const,
        url: photo.url,
        name: photo.name,
        createdAt: photo.createdAt,
      })),
    );
    saved = { ...row, photos: [...row.photos] };
  });
  return saved;
}

export function deleteMeasurementPhoto(
  companyId: string,
  measurementId: string,
  photoId: string,
): void {
  let removed: ClientMeasurementPhoto | undefined;
  mutateData((data) => {
    const row = data.clientMeasurements.find(
      (m) => m.id === measurementId && m.companyId === companyId,
    );
    if (!row) throw new Error("Замер не найден");
    removed = row.photos.find((p) => p.id === photoId);
    row.photos = row.photos.filter((p) => p.id !== photoId);
    row.updatedAt = nowIso();
  });
  if (!removed) return;
  const file = new URL(removed.url, "http://local").searchParams.get("file");
  if (file) {
    fs.rmSync(path.join(measurementDir(companyId, measurementId), path.basename(file)), {
      force: true,
    });
  }
}
