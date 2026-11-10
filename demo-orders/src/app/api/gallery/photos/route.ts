import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import {
  deleteGalleryPhoto,
  listGalleryPhotos,
  updateGalleryPhoto,
  uploadGalleryPhotos,
} from "@/lib/services/gallery";

async function authorize(action: "read" | "write") {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "gallery", action)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

function failure(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
}

export async function GET(req: Request) {
  const { session, error } = await authorize("read");
  if (error) return error;
  const q = new URL(req.url).searchParams;
  return NextResponse.json({
    photos: listGalleryPhotos(session.companyId, {
      folderId: q.get("folderId") ?? undefined,
      clientId: q.get("clientId") ?? undefined,
      orderId: q.get("orderId") ?? undefined,
    }),
  });
}

export async function POST(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const form = await req.formData();
  const folderId = String(form.get("folderId") || "");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!folderId || files.length === 0) {
    return NextResponse.json({ error: "Выберите папку и файлы" }, { status: 400 });
  }
  if (files.length > 50) {
    return NextResponse.json({ error: "Не больше 50 файлов за раз" }, { status: 400 });
  }
  try {
    const photos = await uploadGalleryPhotos(session.companyId, folderId, files, {
      clientId: String(form.get("clientId") || "") || null,
      orderId: String(form.get("orderId") || "") || null,
    });
    return NextResponse.json({ ok: true, photos });
  } catch (e) {
    return failure(e);
  }
}

const patchSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().nullable().optional(),
  orderId: z.string().nullable().optional(),
});

export async function PATCH(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  try {
    return NextResponse.json({ ok: true, photo: updateGalleryPhoto(session.companyId, id, patch) });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указано фото" }, { status: 400 });
  deleteGalleryPhoto(session.companyId, id);
  return NextResponse.json({ ok: true });
}
