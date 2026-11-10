import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { bootstrap } from "@/lib/bootstrap";
import { canHostAttendanceQr } from "@/lib/rbac";
import { rotateQr } from "@/lib/services/attendance";

export async function POST() {
  await bootstrap();
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  }
  if (!canHostAttendanceQr(session)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  try {
    const qr = rotateQr(session.companyId);
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
    console.error("qr rotate failed", e);
    return NextResponse.json({ error: "Не удалось обновить QR" }, { status: 500 });
  }
}
