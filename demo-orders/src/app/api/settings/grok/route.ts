import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { isTextilesCompany } from "@/lib/company";
import { can } from "@/lib/rbac";
import { getGrokAuthAdapter, checkGrokConnection, updateGrokSettings } from "@/lib/integrations/grok";
import { grokAdminView } from "@/lib/integrations/grok/admin-view";
import type { SessionUser } from "@/types";

async function adminSession(): Promise<SessionUser | NextResponse> {
  await bootstrap();
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  if (!can(session, "settings", "manage")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }
  if (!isTextilesCompany(session.companyId)) {
    return NextResponse.json({ error: "Недоступно" }, { status: 400 });
  }
  return session;
}

export async function GET() {
  const session = await adminSession();
  if (session instanceof NextResponse) return session;
  return NextResponse.json(grokAdminView(session.companyId));
}

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(["test", "live"]).optional(),
  allowedCommands: z.array(z.string().trim().min(1).max(64)).max(100).optional(),
  allowedUserIds: z.array(z.string().trim().min(1).max(64)).max(200).optional(),
});

export async function PATCH(request: Request) {
  const session = await adminSession();
  if (session instanceof NextResponse) return session;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }
  updateGrokSettings(session.companyId, parsed.data);
  return NextResponse.json(grokAdminView(session.companyId));
}

/** Connection check: local readiness only, no outgoing call to Grok. */
export async function POST() {
  const session = await adminSession();
  if (session instanceof NextResponse) return session;
  const check = checkGrokConnection(session.companyId, getGrokAuthAdapter().isConfigured());
  return NextResponse.json({ check, view: grokAdminView(session.companyId) });
}
