import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { isTextilesCompany } from "@/lib/company";
import { can } from "@/lib/rbac";
import {
  addMeasurementPhotos,
  deleteMeasurementPhoto,
} from "@/lib/services/client-measurements";

async function authorize() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!can(session, "calculator", "write") || !isTextilesCompany(session.companyId)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

export async function POST(req: Request) {
  const { session, error } = await authorize();
  if (error || !session) return error;
  const form = await req.formData();
  const measurementId = String(form.get("measurementId") || "");
  const files = form
    .getAll("files")
    .filter((file): file is File => file instanceof File && file.size > 0);
  if (!measurementId) {
    return NextResponse.json({ error: "Не указан замер" }, { status: 400 });
  }
  try {
    const measurement = await addMeasurementPhotos(session.companyId, measurementId, files);
    return NextResponse.json({ ok: true, measurement });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  const { session, error } = await authorize();
  if (error || !session) return error;
  const url = new URL(req.url);
  const measurementId = url.searchParams.get("measurementId") ?? "";
  const photoId = url.searchParams.get("photoId") ?? "";
  if (!measurementId || !photoId) {
    return NextResponse.json({ error: "Не указано фото" }, { status: 400 });
  }
  try {
    deleteMeasurementPhoto(session.companyId, measurementId, photoId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 400 },
    );
  }
}
