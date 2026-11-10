import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { ALL_RESOURCES, canManageAccess, type Resource } from "@/lib/rbac";
import { StaffError, updateStaff } from "@/lib/services/staff-access";
import { ROLE_LABELS, type UserRole } from "@/types";

type Ctx = { params: Promise<{ id: string }> };

const levelSchema = z.enum(["none", "read", "write"]);
const accessSchema = z
  .record(z.string(), levelSchema)
  .refine((r) => Object.keys(r).every((k) => ALL_RESOURCES.includes(k as Resource)));

const patchSchema = z
  .object({
    role: z.enum(Object.keys(ROLE_LABELS) as [UserRole, ...UserRole[]]).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(1).max(200).optional(),
    login: z.string().trim().toLowerCase().min(3).max(32).optional(),
    access: accessSchema.optional(),
    deleteOrders: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0);

export async function PATCH(request: Request, ctx: Ctx) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canManageAccess(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const { data, error } = await parseJson(request, patchSchema);
  if (error) return error;
  try {
    const user = updateStaff(session, id, {
      ...data,
      access: data.access as Partial<Record<Resource, "none" | "read" | "write">> | undefined,
    });
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof StaffError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
}
