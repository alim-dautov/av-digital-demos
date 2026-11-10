import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { bootstrap } from "@/lib/bootstrap";
import { parseJson } from "@/lib/api";
import { getSettings, updateSettings } from "@/lib/services/settings";

const time = z.string().trim().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const nonNegative = (max: number) => z.coerce.number().finite().min(0).max(max);

const patchSchema = z
  .object({
    workStart: time,
    workEnd: time,
    workDays: z.array(z.coerce.number().int().min(0).max(6)).max(7),
    lateThresholdMinutes: nonNegative(24 * 60),
    latePenaltyAmount: nonNegative(100_000_000),
    advanceMaxPercent: nonNegative(100),
    defaultAssemblerPercent: nonNegative(100),
    qrRotateSeconds: nonNegative(24 * 60 * 60),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0);

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const settings = getSettings(session.companyId);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "settings", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { data: patch, error } = await parseJson(request, patchSchema, "Некорректные настройки");
  if (error) return error;

  const next = { ...getSettings(session.companyId), ...patch };
  if (next.workDays.length === 0) {
    return NextResponse.json(
      { error: "Выберите хотя бы один рабочий день" },
      { status: 400 },
    );
  }
  if (next.workStart >= next.workEnd) {
    return NextResponse.json(
      { error: "Начало смены должно быть раньше окончания" },
      { status: 400 },
    );
  }

  try {
    const settings = updateSettings(session.companyId, patch);
    return NextResponse.json({ settings });
  } catch {
    return NextResponse.json(
      { error: "Не удалось сохранить настройки" },
      { status: 500 },
    );
  }
}
