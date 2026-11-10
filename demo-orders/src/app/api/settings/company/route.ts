import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ALL_RESOURCES } from "@/lib/rbac";
import { mutateDataLocked } from "@/lib/db";

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (session.role !== "OWNER" && session.role !== "ADMIN") return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 100) return NextResponse.json({ error: "Название должно содержать от 1 до 100 символов" }, { status: 400 });
  let disabled: unknown;
  try { disabled = JSON.parse(String(form.get("disabledModules") ?? "[]")); } catch { return NextResponse.json({ error: "Некорректные модули" }, { status: 400 }); }
  if (!Array.isArray(disabled) || disabled.some((v) => typeof v !== "string" || v === "settings" || !ALL_RESOURCES.some((resource) => resource === v))) return NextResponse.json({ error: "Некорректные модули" }, { status: 400 });
  const file = form.get("logo");
  let logoUrl: string | null | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > 1024 * 1024) return NextResponse.json({ error: "Логотип должен быть не больше 1 МБ" }, { status: 400 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const webp = bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WEBP";
    const mime = png ? "image/png" : jpg ? "image/jpeg" : webp ? "image/webp" : null;
    if (!mime) return NextResponse.json({ error: "Загрузите PNG, JPEG или WebP" }, { status: 400 });
    logoUrl = `data:${mime};base64,${bytes.toString("base64")}`;
  } else if (form.get("removeLogo") === "true") logoUrl = null;
  const company = mutateDataLocked((data) => {
    const current = data.companies.find((c) => c.id === session.companyId);
    if (!current) return null;
    current.name = name;
    current.disabledModules = [...new Set(disabled as string[])];
    if (logoUrl !== undefined) current.logoUrl = logoUrl;
    return current;
  });
  return company ? NextResponse.json({ company }) : NextResponse.json({ error: "Компания не найдена" }, { status: 404 });
}
