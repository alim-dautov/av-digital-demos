import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJson } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { DISPLAY_NAME_MAX, renameUserDisplayName, UserNameError } from "@/lib/services/users";

const patchSchema = z.object({
  userId: z.string().trim().min(1).max(64).optional(),
  fullName: z.string().trim().min(1).max(DISPLAY_NAME_MAX),
});

export async function PATCH(request: Request) {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  const { data, error } = await parseJson(
    request,
    patchSchema,
    "Имя должно быть от 1 до 100 символов",
  );
  if (error) return error;

  try {
    const user = renameUserDisplayName(
      { id: session.id, role: session.role, companyId: session.companyId },
      data.userId ?? session.id,
      data.fullName,
    );
    return NextResponse.json({ user });
  } catch (e) {
    if (e instanceof UserNameError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Не удалось сохранить имя" }, { status: 500 });
  }
}
