import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/api";
import { updateTaskStatus } from "@/lib/services/tasks";

const bodySchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "overdue"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "tasks", "write")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { id } = await params;
    const { data, error } = await parseJson(request, bodySchema, "Некорректный статус");
    if (error) return error;

    const task = updateTaskStatus(session.companyId, id, data.status);
    if (!task) {
      return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
    }

    return NextResponse.json({ task });
  } catch {
    return NextResponse.json({ error: "Не удалось обновить задачу" }, { status: 500 });
  }
}
