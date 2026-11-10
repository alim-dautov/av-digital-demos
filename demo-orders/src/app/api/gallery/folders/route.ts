import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import {
  createGalleryFolder,
  deleteGalleryFolder,
  listGalleryFolders,
  renameGalleryFolder,
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

const nameSchema = z.object({ name: z.string().trim().min(1).max(60) });

function failure(e: unknown) {
  return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
}

export async function GET() {
  const { session, error } = await authorize("read");
  if (error) return error;
  return NextResponse.json({ folders: listGalleryFolders(session.companyId) });
}

export async function POST(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const parsed = nameSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Укажите название" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, folder: createGalleryFolder(session.companyId, parsed.data.name) });
  } catch (e) {
    return failure(e);
  }
}

export async function PATCH(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const parsed = nameSchema.extend({ id: z.string().min(1) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  try {
    return NextResponse.json({
      ok: true,
      folder: renameGalleryFolder(session.companyId, parsed.data.id, parsed.data.name),
    });
  } catch (e) {
    return failure(e);
  }
}

export async function DELETE(req: Request) {
  const { session, error } = await authorize("write");
  if (error) return error;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Не указана папка" }, { status: 400 });
  try {
    deleteGalleryFolder(session.companyId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
