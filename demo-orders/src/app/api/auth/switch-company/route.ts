import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthError, switchCompany } from "@/lib/auth";
import { matchCompanyPath } from "@/lib/company-apps";

const bodySchema = z.object({ companyId: z.string().trim().min(1).max(64) });

export async function POST(request: Request) {
  const referer = request.headers.get("referer") ?? "";
  try {
    if (matchCompanyPath(new URL(referer).pathname)) {
      return NextResponse.json(
        { error: "В этом приложении компания зафиксирована" },
        { status: 403 },
      );
    }
  } catch {
    /* no referer */
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });
  }
  try {
    const user = await switchCompany(parsed.data.companyId);
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Не удалось сменить компанию" }, { status: 500 });
  }
}
