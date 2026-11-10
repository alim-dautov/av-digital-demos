import ExcelJS from "exceljs";
import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { products } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, type Principal } from "@/lib/rbac";
import { norm, toTiyn } from "@/lib/format";
import { createProduct, listFolders, listProducts, saveFolder, updateProduct, visiblePriceTypes, getProduct } from "./service";

const BASE = ["Название", "Артикул", "Штрихкод", "Ед.", "Папка", "Мин. остаток", "Остаток"];

function folderPaths(folders: { id: number; name: string; parentId: number | null }[]) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id: number): string => {
    const f = byId.get(id);
    if (!f) return "";
    return f.parentId ? `${path(f.parentId)} / ${f.name}` : f.name;
  };
  return new Map(folders.map((f) => [f.id, path(f.id)]));
}

/** Выгрузка товаров в Excel (закупка — только с правом) */
export async function exportProducts(db: DB, p: Principal, params: { q?: string; folderId?: number | null } = {}) {
  assertCan(p, "products");
  const types = await visiblePriceTypes(db, p);
  const paths = folderPaths(await listFolders(db));
  const wb = new ExcelJS.Workbook();
  wb.creator = "Electro Demo CRM";
  const ws = wb.addWorksheet("Товары", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [...BASE, ...types.map((t) => t.name)].map((h, i) => ({ header: h, key: String(i), width: i === 0 ? 48 : i === 4 ? 28 : 14 }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2B54" } };
  let page = 1;
  for (;;) {
    const r = await listProducts(db, p, { ...params, page, pageSize: 500 });
    for (const pr of r.rows) {
      ws.addRow([pr.name, pr.sku ?? "", pr.barcode ?? "", pr.unit, pr.folderId ? paths.get(pr.folderId) ?? "" : "", pr.minStock, pr.stock, ...types.map((t) => (pr.prices[t.id] ?? 0) / 100)]);
    }
    if (page * 500 >= r.total) break;
    page++;
  }
  for (let c = BASE.length + 1; c <= BASE.length + types.length; c++) ws.getColumn(c).numFmt = "# ##0.00";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export type ImportResult = { created: number; updated: number; skipped: number; errors: string[]; dryRun: boolean };

/**
 * Импорт: ищем товар по артикулу, затем по точному названию. Создаём папки по пути «А / Б».
 * Цены — по колонкам с названием типа цены. Пустые ячейки цены не трогаем.
 */
export async function importProducts(db: DB, p: Principal, buf: Buffer, dryRun: boolean): Promise<ImportResult> {
  assertCan(p, "products", "full");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("В файле нет листов");
  const header = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? "").trim());
  const col = (name: string) => header.findIndex((h) => norm(h) === norm(name));
  const iName = col("Название");
  if (iName < 0) throw Object.assign(new Error("Нет колонки «Название» в первой строке"), { status: 400 });
  const types = await visiblePriceTypes(db, p);
  const priceCols = types.map((t) => ({ t, i: col(t.name) })).filter((x) => x.i >= 0);
  const folders = await listFolders(db);
  const paths = folderPaths(folders);
  const byPath = new Map([...paths].map(([id, path]) => [norm(path), id]));
  const res: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [], dryRun };
  const cell = (row: ExcelJS.Row, i: number) => {
    if (i < 0) return "";
    const v = row.getCell(i + 1).value as unknown;
    if (v && typeof v === "object" && "result" in (v as object)) return String((v as { result: unknown }).result ?? "");
    if (v && typeof v === "object" && "text" in (v as object)) return String((v as { text: unknown }).text ?? "");
    return v == null ? "" : String(v).trim();
  };
  const ensureFolder = async (path: string): Promise<number | null> => {
    if (!path) return null;
    const key = norm(path);
    if (byPath.has(key)) return byPath.get(key)!;
    if (dryRun) return null;
    let parent: number | null = null, acc = "";
    for (const part of path.split("/").map((s) => s.trim()).filter(Boolean)) {
      acc = acc ? `${acc} / ${part}` : part;
      const k = norm(acc);
      if (!byPath.has(k)) { const f = await saveFolder(db, p, { name: part, parentId: parent }); byPath.set(k, f.id); }
      parent = byPath.get(k)!;
    }
    return parent;
  };
  const rows: ExcelJS.Row[] = [];
  ws.eachRow((r, n) => { if (n > 1) rows.push(r); });
  if (rows.length > 5000) throw Object.assign(new Error("Не больше 5000 строк за раз"), { status: 400 });
  for (const row of rows) {
    const name = cell(row, iName);
    if (!name) { res.skipped++; continue; }
    try {
      const sku = cell(row, col("Артикул")) || null;
      const [found] = sku
        ? await db.select({ id: products.id }).from(products).where(and(eq(products.sku, sku), isNull(products.deletedAt))).limit(1)
        : await db.select({ id: products.id }).from(products).where(and(eq(products.name, name), isNull(products.deletedAt))).limit(1);
      const prices: Record<string, number> = {};
      for (const pc of priceCols) { const v = cell(row, pc.i); if (v !== "") prices[pc.t.id] = toTiyn(v); }
      const folderPath = cell(row, col("Папка"));
      const minStock = Number(cell(row, col("Мин. остаток")).replace(",", ".")) || 0;
      if (found) {
        res.updated++;
        if (dryRun) continue;
        const cur = await getProduct(db, p, found.id);
        await updateProduct(db, p, found.id, {
          name, sku: sku ?? cur.sku, barcode: cell(row, col("Штрихкод")) || cur.barcode, unit: cell(row, col("Ед.")) || cur.unit, description: cur.description,
          folderId: folderPath ? await ensureFolder(folderPath) : cur.folderId, minStock: col("Мин. остаток") >= 0 ? minStock : cur.minStock, active: cur.active,
          photos: cur.photos, prices: { ...Object.fromEntries(Object.entries(cur.prices).map(([k, v]) => [k, v])), ...prices },
        });
      } else {
        res.created++;
        if (dryRun) continue;
        await createProduct(db, p, {
          name, sku, barcode: cell(row, col("Штрихкод")) || null, unit: cell(row, col("Ед.")) || "шт", description: "",
          folderId: await ensureFolder(folderPath), minStock, active: true, photos: [], prices,
        });
      }
    } catch (e) {
      res.errors.push(`Строка ${row.number}: ${(e as Error).message}`);
    }
  }
  if (!dryRun) await audit(db, p, "import", "product", null, `Импорт товаров: +${res.created}, обновлено ${res.updated}`);
  return res;
}
