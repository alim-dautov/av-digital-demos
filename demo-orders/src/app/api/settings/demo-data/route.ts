import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { getData, getDataPath, mutateDataLocked } from "@/lib/db";
import { backupDataFile } from "@/lib/db/migrations";
import { canManageAccess } from "@/lib/rbac";
import { findDemoData, purgeDemoData, removeUploadDirs } from "@/lib/services/demo-cleanup";

const purgeSchema = z.object({ confirm: z.literal(true) });

async function guard() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }) };
  }
  if (!canManageAccess(session)) {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }
  return { session };
}

export async function GET() {
  const { session, error } = await guard();
  if (error) return error;
  return NextResponse.json({ report: findDemoData(getData(), session.companyId) });
}

export async function POST(request: Request) {
  const { session, error } = await guard();
  if (error) return error;
  const { error: bad } = await parseJson(request, purgeSchema, "Подтвердите удаление");
  if (bad) return bad;

  const backup = backupDataFile(getDataPath());
  const { report, uploadDirs } = mutateDataLocked((data) =>
    purgeDemoData(data, session.companyId),
  );
  removeUploadDirs(uploadDirs);
  return NextResponse.json({
    report,
    backup: backup ? path.basename(backup) : null,
  });
}
