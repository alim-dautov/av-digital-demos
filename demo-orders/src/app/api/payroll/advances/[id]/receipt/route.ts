import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { actorOf, outOfScope, payrollFailure, payrollSession } from "@/lib/payroll-http";
import { getAdvance, setAdvanceReceipt } from "@/lib/services/payroll";
import {
  mediaFileUrl,
  prepareImage,
  randomImageFileName,
  uploadPath,
} from "@/lib/uploads";
import { generateId, nowIso } from "@/lib/utils";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const { id } = await ctx.params;
  const existing = getAdvance(session.companyId, id);
  if (!existing) {
    return NextResponse.json({ error: "Аванс не найден" }, { status: 404 });
  }
  const denied = outOfScope(session, existing.employeeId);
  if (denied) return denied;

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "Файл слишком большой или повреждён" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Выберите фото чека" }, { status: 400 });
  }
  const image = await prepareImage(file);
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: 400 });

  const dir = uploadPath(session.companyId, "advance", id);
  fs.mkdirSync(dir, { recursive: true });
  const filename = randomImageFileName(image.mime);
  fs.writeFileSync(path.join(dir, filename), image.data);

  try {
    const advance = setAdvanceReceipt(
      session.companyId,
      id,
      {
        id: generateId("media"),
        type: "photo",
        url: mediaFileUrl(session.companyId, "advance", id, filename),
        name: file.name.slice(0, 200) || filename,
        createdAt: nowIso(),
      },
      actorOf(session),
    );
    return NextResponse.json({ advance });
  } catch (e) {
    fs.rmSync(path.join(dir, filename), { force: true });
    return payrollFailure(e, "Не удалось сохранить чек");
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { session, error } = await payrollSession("write");
  if (error) return error;
  const { id } = await ctx.params;
  const denied = outOfScope(session, getAdvance(session.companyId, id)?.employeeId);
  if (denied) return denied;
  try {
    const advance = setAdvanceReceipt(session.companyId, id, null, actorOf(session));
    return NextResponse.json({ advance });
  } catch (e) {
    return payrollFailure(e, "Не удалось удалить чек");
  }
}
