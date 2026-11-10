"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";
import { importProducts } from "./xlsx";

const id = z.number().int();
const ids = z.array(id).min(1);
const done = <T,>(v: T) => { svc.invalidateCatalog(); return v; };

export const createProductAction = action(svc.productInput, async (i, { db, p }) => done(await svc.createProduct(db, p, i)), { revalidate: ["/products"] });
export const updateProductAction = action(z.object({ id, data: svc.productInput }), async (i, { db, p }) => done(await svc.updateProduct(db, p, i.id, i.data)), { revalidate: ["/products"] });
export const deleteProductsAction = action(z.object({ ids }), async (i, { db, p }) => done(await svc.deleteProducts(db, p, i.ids)), { revalidate: ["/products"] });
export const moveProductsAction = action(z.object({ ids, folderId: id.nullable() }), (i, { db, p }) => svc.moveProducts(db, p, i.ids, i.folderId), { revalidate: ["/products"] });
export const saveFolderAction = action(z.object({ id: id.optional(), name: z.string().trim().min(1).max(100), parentId: id.nullable() }), (i, { db, p }) => svc.saveFolder(db, p, i), { revalidate: ["/products"] });
export const deleteFolderAction = action(z.object({ id }), (i, { db, p }) => svc.deleteFolder(db, p, i.id), { revalidate: ["/products"] });
export const previewBulkAction = action(svc.bulkPriceInput, (i, { db, p }) => svc.previewBulkPrice(db, p, i));
export const applyBulkAction = action(z.object({ input: svc.bulkPriceInput, description: z.string().max(300) }), (i, { db, p }) => svc.applyBulkPrice(db, p, i.input, i.description), { revalidate: ["/products"] });
export const rollbackBatchAction = action(z.object({ id }), (i, { db, p }) => svc.rollbackBatch(db, p, i.id), { revalidate: ["/products"] });
export const quickSearchAction = action(z.object({ q: z.string().max(100) }), (i, { db, p }) => svc.quickSearch(db, p, i.q, 15));

/** Импорт из Excel: FormData с полем file */
export async function importProductsAction(form: FormData) {
  const { getSessionUser } = await import("@/lib/auth");
  const { getDb } = await import("@/db");
  const { errorMessage } = await import("@/lib/action");
  const u = await getSessionUser();
  if (!u) return { ok: false as const, error: "Сессия истекла" };
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { ok: false as const, error: "Выберите файл .xlsx" };
  if (f.size > 10 * 1024 * 1024) return { ok: false as const, error: "Файл больше 10 МБ" };
  try {
    const db = await getDb();
    const r = await importProducts(db, u, Buffer.from(await f.arrayBuffer()), form.get("dryRun") === "1");
    svc.invalidateCatalog();
    const { revalidatePath } = await import("next/cache");
    revalidatePath("/products", "layout");
    return { ok: true as const, data: r };
  } catch (e) {
    return { ok: false as const, error: errorMessage(e) };
  }
}
