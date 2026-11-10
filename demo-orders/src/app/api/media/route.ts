import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { getData, mutateData } from "@/lib/db";
import {
  mediaFileUrl,
  prepareImage,
  randomImageFileName,
  uploadPath,
} from "@/lib/uploads";
import { copyPhotosOntoClient, unlinkClientPhotos } from "@/lib/services/client-photos";
import { generateId, nowIso } from "@/lib/utils";
import type { AppData, MediaItem } from "@/types";
import { isActiveOrder } from "@/lib/domain/order-lifecycle";

const targetSchema = z.object({
  entityType: z.enum(["client", "order"]),
  entityId: z.string().trim().min(1).max(64),
});

const deleteSchema = targetSchema.extend({ mediaId: z.string().min(1).max(64) });

type Target = z.infer<typeof targetSchema>;

function findEntity(data: AppData, companyId: string, target: Target) {
  if (target.entityType === "client") {
    return data.clients.find((c) => c.id === target.entityId && c.companyId === companyId) ?? null;
  }
  return (
    data.orders.find(
      (o) =>
        o.companyId === companyId &&
        isActiveOrder(o) &&
        (o.id === target.entityId || o.number === target.entityId),
    ) ?? null
  );
}

async function authorize(entityType: Target["entityType"]) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  const resource = entityType === "client" ? "clients" : "orders";
  if (!can(session, resource, "write")) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

const MAX_FILES_PER_REQUEST = 20;

export async function POST(req: Request) {
  if (process.env.DEMO_MODE === "1") {
    return NextResponse.json({ error: "В демо-версии загрузка файлов отключена" }, { status: 403 });
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Файл слишком большой или повреждён" }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  const parsed = targetSchema.safeParse({
    entityType: form.get("entityType"),
    entityId: form.get("entityId"),
  });
  const roomId = form.get("roomId");
  if (
    !parsed.success ||
    files.length === 0 ||
    files.length > MAX_FILES_PER_REQUEST ||
    (roomId !== null && (typeof roomId !== "string" || roomId.length > 64))
  ) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const target = parsed.data;
  const { session, error } = await authorize(target.entityType);
  if (error) return error;

  const entity = findEntity(getData(), session.companyId, target);
  if (!entity) return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });

  const dir = uploadPath(session.companyId, target.entityType, entity.id);
  fs.mkdirSync(dir, { recursive: true });

  const items: MediaItem[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const image = await prepareImage(file);
    if (!image.ok) {
      errors.push(image.error);
      continue;
    }
    const filename = randomImageFileName(image.mime);
    fs.writeFileSync(path.join(dir, filename), image.data);
    items.push({
      id: generateId("media"),
      type: "photo",
      url: mediaFileUrl(session.companyId, target.entityType, entity.id, filename),
      name: file.name.slice(0, 200) || filename,
      createdAt: nowIso(),
      ...(target.entityType === "order" && roomId ? { roomId } : {}),
    });
  }

  if (items.length) {
    mutateData((data) => {
      const fresh = findEntity(data, session.companyId, target);
      if (!fresh) return;
      if (target.entityType === "client") {
        const client = fresh as AppData["clients"][number];
        if (!client.photos) client.photos = [];
        client.photos.push(...items);
      } else {
        const order = fresh as AppData["orders"][number];
        order.media.push(...items);
        copyPhotosOntoClient(data, session.companyId, order.clientId, items);
      }
    });
  }

  if (!items.length) {
    return NextResponse.json({ error: errors.join("; ") || "Ошибка загрузки", errors }, { status: 400 });
  }
  return NextResponse.json({ ok: true, media: items[0], items, errors });
}

export async function DELETE(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { mediaId, ...target } = parsed.data;
  const { session, error } = await authorize(target.entityType);
  if (error) return error;

  let removed: MediaItem | undefined;
  mutateData((data) => {
    const entity = findEntity(data, session.companyId, target);
    if (!entity) return;
    if (target.entityType === "client") {
      const client = entity as AppData["clients"][number];
      removed = client.photos?.find((m) => m.id === mediaId);
      client.photos = (client.photos ?? []).filter((m) => m.id !== mediaId);
    } else {
      const order = entity as AppData["orders"][number];
      removed = order.media.find((m) => m.id === mediaId);
      order.media = order.media.filter((m) => m.id !== mediaId);
      if (removed) unlinkClientPhotos(data, session.companyId, order.clientId, removed.id);
    }
  });

  if (removed && !removed.sourceMediaId) {
    const q = new URL(removed.url, "http://local").searchParams;
    const file = q.get("file");
    const storedId = q.get("entityId");
    if (file && storedId && q.get("companyId") === session.companyId) {
      fs.rmSync(uploadPath(session.companyId, target.entityType, storedId, file), { force: true });
    }
  }

  return NextResponse.json({ ok: true });
}
