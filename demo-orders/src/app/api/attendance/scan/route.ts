import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { can } from "@/lib/rbac";
import { scanQr } from "@/lib/services/attendance";

function extractToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { token?: unknown };
      if (typeof parsed.token === "string" && parsed.token.trim()) {
        return parsed.token.trim();
      }
    } catch {
      // treat as raw token
    }
  }

  return trimmed;
}

export async function POST(request: Request) {
  await bootstrap();

  let session;
  try {
    session = await requireSession();
  } catch {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }

  if (!can(session, "attendance", "write")) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  if (!session.employeeId) {
    return NextResponse.json(
      { error: "К аккаунту не привязан сотрудник" },
      { status: 400 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const token = extractToken(body.token);
  if (!token) {
    return NextResponse.json({ error: "Укажите токен QR" }, { status: 400 });
  }

  try {
    const result = scanQr(session.companyId, token, session.employeeId);
    return NextResponse.json({
      checkInAt: result.checkInAt,
      lateMinutes: result.lateMinutes,
      penaltyAmount: result.penaltyAmount,
      attendance: result.attendance,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Ошибка сканирования";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
