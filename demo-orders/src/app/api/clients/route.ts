import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { leadSourceSchema, optionalText, parseJson } from "@/lib/api";
import { createClient } from "@/lib/services/clients";

const bodySchema = z.object({
  fullName: z.string().trim().min(1).max(200),  phone: z.string().trim().min(1).max(50),
  source: leadSourceSchema,
  whatsapp: optionalText(50),
  email: optionalText(254),
  comment: optionalText(2000),
});

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
    if (!can(session, "clients", "write")) {
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    }

    const { data, error } = await parseJson(request, bodySchema, "Укажите имя, телефон и источник");
    if (error) return error;

    const client = createClient(session.companyId, data);
    return NextResponse.json({ client }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось создать клиента" }, { status: 500 });
  }
}
