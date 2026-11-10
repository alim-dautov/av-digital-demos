import { fileResponse, withUser, XLSX } from "@/lib/http";
import { exportProducts } from "@/modules/products/xlsx";
import { today } from "@/lib/format";

export const GET = withUser(async (req, { db, p }) => {
  const sp = new URL(req.url).searchParams;
  const buf = await exportProducts(db, p, { q: sp.get("q") ?? undefined, folderId: sp.get("folder") ? Number(sp.get("folder")) : null });
  return fileResponse(buf, `Товары DEMO ${today()}.xlsx`, XLSX);
});
