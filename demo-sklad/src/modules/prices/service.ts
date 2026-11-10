import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import { q } from "@/db/sql";
import { assertCan, ForbiddenError, NotFoundError, type Principal } from "@/lib/rbac";
import { stockSql } from "@/modules/stock/queries";
import { folderDescendants, listFolders, visiblePriceTypes } from "@/modules/products/service";
import type { PLRow } from "@/lib/pdf/docs";

/** Строки прайс-листа: цена выбранного типа (Базар / Магазин …), группировка по полному пути папки */
export async function priceListRows(db: DB, p: Principal, params: { priceTypeId: number; folderId?: number | null; inStockOnly?: boolean }) {
  assertCan(p, "prices");
  const types = await visiblePriceTypes(db, p);
  const t = types.find((x) => x.id === params.priceTypeId);
  if (!t) throw new NotFoundError("Тип цены не найден");
  if (t.isPurchase) throw new ForbiddenError("Закупочные цены не выгружаются в прайс");
  const folders = await listFolders(db);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id: number | null): string => { const f = id ? byId.get(id) : null; return f ? (f.parentId ? `${path(f.parentId)} / ${f.name}` : f.name) : "Без папки"; };
  const ids = params.folderId ? await folderDescendants(db, params.folderId) : null;
  const rows = await q<{ name: string; sku: string | null; unit: string; folder_id: number | null; price: number; stock: number }>(db, sql`
    select p.name, p.sku, p.unit, p.folder_id, pp.value::float8 price, coalesce(s.qty, 0)::float8 stock
    from products p join product_prices pp on pp.product_id = p.id and pp.price_type_id = ${t.id}
    left join ${stockSql()} s on s.product_id = p.id
    where p.deleted_at is null and p.active and pp.value > 0
      ${ids ? sql`and p.folder_id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})` : sql``}
      ${params.inStockOnly ? sql`and coalesce(s.qty, 0) > 0` : sql``}`);
  const out: PLRow[] = rows.map((r) => ({ folder: path(r.folder_id), name: r.name, sku: r.sku, unit: r.unit, price: Number(r.price), stock: Number(r.stock) }));
  out.sort((a, b) => a.folder.localeCompare(b.folder, "ru") || a.name.localeCompare(b.name, "ru"));
  return { type: t, rows: out, folderName: params.folderId ? path(params.folderId) : null };
}
