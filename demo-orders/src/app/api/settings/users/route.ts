import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { canManageAccess } from "@/lib/rbac";
import { createStaff, listStaff, StaffError } from "@/lib/services/staff-access";
import { ROLE_LABELS, type UserRole } from "@/types";

const roleSchema = z.enum(Object.keys(ROLE_LABELS) as [UserRole, ...UserRole[]]);

const createSchema = z.object({
  fullName: z.string().trim().min(1).max(100),
  login: z.string().trim().toLowerCase().min(3).max(32),
  password: z.string().min(1).max(200),
  role: roleSchema,
  position: z.string().trim().max(100).nullish(),
});

async function manager() {
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
  const { session, error } = await manager();
  if (error) return error;
  return NextResponse.json({ users: listStaff(session.companyId) });
}

export async function POST(request: Request) {
  const { session, error } = await manager();
  if (error) return error;
  const { data, error: bad } = await parseJson(request, createSchema);
  if (bad) return bad;
  try {
    const user = createStaff(session, data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (e) {
    if (e instanceof StaffError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось создать сотрудника" }, { status: 500 });
  }
}
