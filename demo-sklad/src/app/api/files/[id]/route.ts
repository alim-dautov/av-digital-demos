import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { files } from "@/db/schema";
import { fileResponse, withUser } from "@/lib/http";
import { storage } from "@/lib/storage";

/** Отдача файла авторизованным пользователям. Картинки и PDF — inline. */
export const GET = withUser<{ id: string }>(async (_req, { db, params }) => {
  const [f] = await db.select().from(files).where(eq(files.id, Number(params.id)));
  if (!f) return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  const data = await storage().get(f.key);
  if (!data) return NextResponse.json({ error: "Файл не найден в хранилище" }, { status: 404 });
  const res = fileResponse(data, f.name, f.mime, /^(image\/|application\/pdf)/.test(f.mime));
  res.headers.set("cache-control", "private, max-age=86400");
  res.headers.set("x-content-type-options", "nosniff");
  return res;
});
