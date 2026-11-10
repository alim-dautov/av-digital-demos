"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { action } from "@/lib/action";
import { assertCan, assertFlag } from "@/lib/rbac";
import { files } from "@/db/schema";
import { storage } from "@/lib/storage";
import { catalog, invalidateCatalog } from "@/modules/products/service";
import { matchProduct, parseList } from "@/modules/orders/parse";
import { counterparties } from "@/db/schema";
import { sql } from "drizzle-orm";
import type { DB } from "@/db";
import * as svc from "./service";
import { parseReceiptFile, type ParsedReceipt } from "./parser";

const id = z.number().int();
const rv = { revalidate: ["/receipts", "/stock", "/products"] };

export const createReceiptAction = action(svc.receiptInput, async (i, { db, p }) => (await svc.createReceipt(db, p, i)).id, rv);
export const updateReceiptAction = action(z.object({ id, data: svc.receiptInput }), async (i, { db, p }) => (await svc.updateReceipt(db, p, i.id, i.data)).id, rv);
export const setPostedAction = action(z.object({ id, posted: z.boolean() }), (i, { db, p }) => svc.setPosted(db, p, i.id, i.posted), rv);
export const deleteReceiptAction = action(z.object({ id }), (i, { db, p }) => svc.deleteReceipt(db, p, i.id), rv);
export const applyPricesAction = action(svc.applyPricesInput, async (i, { db, p }) => { const r = await svc.applyReceiptPrices(db, p, i); invalidateCatalog(); return r; }, rv);
export const compareAction = action(z.object({ items: z.array(z.object({ productId: id, price: z.number().int() })), date: z.string() }), async (i, { db, p }) => {
  assertFlag(p, "seePurchase");
  return Object.fromEntries(await svc.priceComparison(db, null, i.items, i.date));
});

async function matchLines(db: DB, parsed: ParsedReceipt) {
  const cat = await catalog(db);
  const rows = parsed.lines.map((l) => {
    const m = matchProduct(l.name, cat);
    return {
      raw: l.name, qty: l.qty, unit: l.unit, price: l.price != null ? Math.round(l.price * 100) : null, status: m.status, productId: m.best?.id ?? null,
      candidates: m.candidates.map((c) => ({ id: c.id, name: c.name, unit: c.unit, score: Math.round(c.score * 100) })),
    };
  });
  let supplier: { id: number; name: string } | null = null;
  if (parsed.supplierName) {
    const t = parsed.supplierName.toLowerCase().replace(/["«»]/g, "").replace(/\b(тоо|ип|ао)\b/g, "").trim().slice(0, 40);
    if (t.length >= 3) {
      const [s] = await db.select({ id: counterparties.id, name: counterparties.name }).from(counterparties)
        .where(sql`kind <> 'client' and deleted_at is null and lower(name) like ${"%" + t + "%"}`).limit(1);
      supplier = s ?? null;
    }
  }
  return { rows, docNumber: parsed.docNumber ?? null, docDate: parsed.docDate ?? null, supplierName: parsed.supplierName ?? null, supplier, engine: parsed.engine };
}

/** Разбор загруженного файла (FileRef уже загружен через /api/files) */
export const parseReceiptFileAction = action(z.object({ fileId: id }), async (i, { db, p }) => {
  assertCan(p, "receipts", "full");
  const [f] = await db.select().from(files).where(eq(files.id, i.fileId));
  if (!f) throw Object.assign(new Error("Файл не найден"), { status: 404 });
  const data = await storage().get(f.key);
  if (!data) throw Object.assign(new Error("Файл не найден в хранилище"), { status: 404 });
  return matchLines(db, await parseReceiptFile({ name: f.name, mime: f.mime, data }));
});

export const parseReceiptTextAction = action(z.object({ text: z.string().max(50000) }), async (i, { db, p }) => {
  assertCan(p, "receipts", "full");
  return matchLines(db, { lines: parseList(i.text).map((l) => ({ name: l.name, qty: l.qty, unit: l.unit, price: l.price })), engine: "text" });
});
