import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { dateSchema, idSchema, optional, parseJson, rejectForeignRefs } from "@/lib/api";
import { createTask } from "@/lib/services/tasks";

const bodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullish(),
  deadline: dateSchema,
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  assigneeId: optional(idSchema),
  orderId: optional(idSchema),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "tasks", "write")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { data, error } = await parseJson(request, bodySchema, "Укажите название, срок и приоритет");
    if (error) return error;

    const foreign = rejectForeignRefs(session.companyId, {
      orderId: data.orderId,
      employeeIds: [data.assigneeId],
    });
    if (foreign) return foreign;

    const task = createTask({
      companyId: session.companyId,
      title: data.title,
      description: data.description ?? "",
      deadline: data.deadline,
      priority: data.priority,
      assigneeId: data.assigneeId ?? null,
      orderId: data.orderId ?? null,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось создать задачу" }, { status: 500 });
  }
}
