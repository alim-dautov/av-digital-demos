import fs from "fs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can, canSeeOthersPayroll, type Resource } from "@/lib/rbac";
import { getAdvance } from "@/lib/services/payroll";
import { contentTypeForFile, uploadPath } from "@/lib/uploads";
import type { SessionUser } from "@/types";

/** Чек аванса видят те, кто видит сам аванс: руководство или сам сотрудник. */
function canOpenAdvanceFile(session: SessionUser, advanceId: string): boolean {
  if (!can(session, "payroll", "read")) return false;
  if (canSeeOthersPayroll(session)) return true;
  const advance = getAdvance(session.companyId, advanceId);
  return !!advance && advance.employeeId === session.employeeId;
}

/** Any of these modules opens files of the entity type. */
const FILE_ACCESS: Record<string, Resource[]> = {
  order: ["orders", "workshop", "production", "gallery"],
  client: ["clients", "gallery"],
  measurement: ["calculator", "clients"],
  stage: ["production", "orders"],
  report: ["reports", "orders"],
  gallery: ["gallery"],
};

export async function GET(req: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const file = url.searchParams.get("file");

  if (
    !companyId ||
    !entityType ||
    !entityId ||
    !file ||
    companyId !== session.companyId
  ) {
    return NextResponse.json({ error: "Недоступно" }, { status: 403 });
  }

  const allowed =
    entityType === "advance"
      ? canOpenAdvanceFile(session, entityId)
      : (FILE_ACCESS[entityType] ?? ["gallery"]).some((r) => can(session, r, "read"));
  if (!allowed) {
    return NextResponse.json({ error: "Недоступно" }, { status: 403 });
  }

  const type = contentTypeForFile(file);
  if (!type) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  const full = uploadPath(companyId, entityType, entityId, file);
  if (!fs.existsSync(full)) {
    return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  }

  return new NextResponse(fs.readFileSync(full), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
