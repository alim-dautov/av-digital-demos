import { NextResponse } from "next/server";
import { files } from "@/db/schema";
import { withUser } from "@/lib/http";
import { ALLOWED_MIME, newKey, storage } from "@/lib/storage";
import { rateLimit } from "@/lib/rate-limit";

const MAX = 15 * 1024 * 1024;

/** Загрузка файла (фото, PDF, документы). Возвращает FileRef */
export const POST = withUser(async (req, { db, p }) => {
  if (!rateLimit(`upload:${p.id}`, 60, 60_000).ok) return NextResponse.json({ error: "Слишком много загрузок" }, { status: 429 });
  if (process.env.DEMO_MODE === "1") return NextResponse.json({ error: "В демо-версии загрузка файлов отключена" }, { status: 403 });
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  if (f.size > MAX) return NextResponse.json({ error: "Файл больше 15 МБ" }, { status: 400 });
  if (!ALLOWED_MIME.test(f.type)) return NextResponse.json({ error: "Такой тип файла нельзя загрузить" }, { status: 400 });
  const key = newKey(f.name);
  await storage().put(key, Buffer.from(await f.arrayBuffer()), f.type);
  const [row] = await db.insert(files).values({ key, name: f.name.slice(0, 200), mime: f.type, size: f.size, uploadedBy: p.id }).returning();
  return NextResponse.json({ id: row.id, name: row.name, mime: row.mime, size: row.size });
});
