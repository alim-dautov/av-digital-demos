import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { parseJson } from "@/lib/api";
import { processVoiceCommand } from "@/lib/ai/voice-assistant";

const bodySchema = z.object({ command: z.string().trim().min(1).max(500) });

export async function POST(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!can(session, "assistant", "read")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { data, error } = await parseJson(request, bodySchema, "Команда не указана");
  if (error) return error;

  const result = processVoiceCommand(data.command, {
    companyId: session.companyId,
    userId: session.id,
    employeeId: session.employeeId,
    role: session.role,
    access: session.access,
  });

  return NextResponse.json(result);
}
