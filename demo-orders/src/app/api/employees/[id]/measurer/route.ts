import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { setEmployeeMeasurer } from "@/lib/services/measurements";

const bodySchema = z.object({ isMeasurer: z.boolean() });

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "employees", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  const { id } = await context.params;
  try {
    const employee = setEmployeeMeasurer(session.companyId, id, parsed.data.isMeasurer);
    return NextResponse.json({ ok: true, isMeasurer: employee.isMeasurer });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Ошибка" },
      { status: 404 },
    );
  }
}
