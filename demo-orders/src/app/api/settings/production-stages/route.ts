import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { parseJson } from "@/lib/api";
import { can, canManageAccess } from "@/lib/rbac";
import {
  FunnelError,
  getFunnel,
  saveFunnel,
  stageUsage,
} from "@/lib/services/production-funnel";

const putSchema = z.object({
  stages: z
    .array(
      z.object({
        key: z.string().trim().max(64).nullish(),
        label: z.string().trim().min(1, "Пустое название").max(60),
      }),
    )
    .min(1)
    .max(30),
});

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "orders", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const usage = stageUsage(session.companyId);
  return NextResponse.json({
    stages: getFunnel(session.companyId).map((s) => ({ ...s, used: usage.get(s.key) ?? 0 })),
  });
}

/** Сохранить воронку целиком (порядок, названия, новые/удалённые). Только OWNER/DIRECTOR. */
export async function PUT(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canManageAccess(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { data: body, error } = await parseJson(request, putSchema, "Некорректные этапы");
  if (error) return error;
  try {
    const stages = saveFunnel(session.companyId, body.stages);
    const usage = stageUsage(session.companyId);
    return NextResponse.json({
      stages: stages.map((s) => ({ ...s, used: usage.get(s.key) ?? 0 })),
    });
  } catch (e) {
    if (e instanceof FunnelError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    throw e;
  }
}
