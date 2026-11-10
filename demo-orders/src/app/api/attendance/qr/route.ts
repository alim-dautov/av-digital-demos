import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { canHostAttendanceQr } from "@/lib/rbac";
import { getSettings } from "@/lib/services/settings";
import { getActiveQr, rotateQr } from "@/lib/services/attendance";

export async function GET() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canHostAttendanceQr(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const settings = getSettings(session.companyId);
    let qr = getActiveQr(session.companyId);
    const remainingMs = qr
      ? new Date(qr.expiresAt).getTime() - Date.now()
      : 0;
    // Rotate if missing, expired, or long-lived seed token beyond rotation window
    if (!qr || remainingMs <= 0 || remainingMs > settings.qrRotateSeconds * 1000) {
      qr = rotateQr(session.companyId);
    }

    const payload = JSON.stringify({
      token: qr.token,
      companyId: session.companyId,
    });
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: 640,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0a0a0a", light: "#ffffff" },
    });

    return NextResponse.json({
      token: qr.token,
      expiresAt: qr.expiresAt,
      qrDataUrl,
    });
  } catch (e) {
    console.error("qr fetch failed", e);
    return NextResponse.json({ error: "Не удалось получить QR" }, { status: 500 });
  }
}
