import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { PDF } from "@/lib/pdf/kit";
import { rateLimit } from "@/lib/rate-limit";
import { docVersionByToken } from "@/modules/docs/service";

export const runtime = "nodejs";

/** Отправленная клиенту версия документа: неизменяемый PDF по токену, без входа */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`doc:${ip}`, 60, 60_000).ok) return NextResponse.json({ error: "Слишком много запросов" }, { status: 429 });
  try {
    const d = await docVersionByToken(await getDb(), (await params).token);
    const download = new URL(req.url).searchParams.has("download");
    return new Response(new Uint8Array(d.buf), {
      headers: {
        "content-type": PDF,
        "content-disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(d.name)}`,
        // файл версии не меняется никогда
        "cache-control": "private, max-age=31536000, immutable",
        "x-robots-tag": "noindex",
      },
    });
  } catch {
    return new NextResponse("Документ не найден или ссылка устарела", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}
