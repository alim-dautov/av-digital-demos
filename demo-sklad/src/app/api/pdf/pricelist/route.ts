import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { getSessionUser } from "@/lib/auth";
import { fileResponse, XLSX } from "@/lib/http";
import { linkViewer, type Principal } from "@/lib/rbac";
import { verifyLink } from "@/lib/sign";
import { today } from "@/lib/format";
import { PDF } from "@/lib/pdf/kit";
import { priceListPdf } from "@/lib/pdf/docs";
import { sheetsBuffer } from "@/lib/xlsx";
import { priceListRows } from "@/modules/prices/service";
import { getSetting } from "@/modules/settings/store";

export const runtime = "nodejs";

/**
 * /api/pdf/pricelist?type=<priceTypeId>&folder=<id>&instock=1&stock=1&format=xlsx — по сессии
 * /api/pdf/pricelist?t=<signed> — публичная ссылка для клиента (только PDF, без закупочных цен)
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  let p: Principal | null = null;
  let opt = { type: Number(u.get("type")), folder: u.get("folder") ? Number(u.get("folder")) : null, instock: u.get("instock") === "1", stock: u.get("stock") === "1" };
  let xlsx = u.get("format") === "xlsx";
  const t = u.get("t");
  if (t) {
    const link = verifyLink<{ t: string; type: number; folder: number | null; instock: boolean; stock: boolean }>(t);
    if (!link || link.t !== "pl") return NextResponse.json({ error: "Ссылка недействительна или истекла" }, { status: 403 });
    opt = link; xlsx = false;
    p = linkViewer({ prices: "view" });
  } else {
    const s = await getSessionUser();
    if (!s || s.mustChangePassword) return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    p = s;
  }
  try {
    const db = await getDb();
    const r = await priceListRows(db, p, { priceTypeId: opt.type, folderId: opt.folder, inStockOnly: opt.instock });
    const title = `Прайс-лист${r.folderName ? ` · ${r.folderName}` : ""}`;
    const fname = `Прайс_${r.type.name}_${today()}`;
    if (xlsx) {
      const buf = await sheetsBuffer([{ name: r.type.name, title: `${title} · ${r.type.name} · ${today()}`, cols: [{ header: "Папка", width: 30 }, { header: "Наименование", width: 50 }, { header: "Артикул" }, { header: "Ед.", width: 8 }, { header: "Цена, ₸", money: true }],
        rows: r.rows.map((x) => [x.folder, x.name, x.sku, x.unit, x.price]) }]);
      return fileResponse(buf, `${fname}.xlsx`, XLSX);
    }
    const buf = await priceListPdf(await getSetting(db, "company"), { title, priceName: r.type.name, date: today(), rows: r.rows, showStock: opt.stock });
    return fileResponse(buf, `${fname}.pdf`, PDF, true);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: (e as { status?: number }).status ?? 500 });
  }
}
