import "server-only";
import { inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { files } from "@/db/schema";
import { storage } from "@/lib/storage";
import { getSetting } from "@/modules/settings/store";
import type { DocCompany } from "./kit";

/** Реквизиты для PDF + загруженные скан печати и факсимиле подписи (PNG с прозрачным фоном) */
export async function docCompany(db: DB): Promise<DocCompany> {
  const c = await getSetting(db, "company");
  const want = [c.stamp === "image" ? c.stampFileId : null, c.stamp !== "none" ? c.signatureFileId : null].filter((x): x is number => !!x);
  if (!want.length) return c;
  const rows = await db.select().from(files).where(inArray(files.id, want));
  const load = async (id: number | null) => {
    const f = rows.find((r) => r.id === id && r.mime === "image/png");
    return f ? await storage().get(f.key) : null;
  };
  return { ...c, stampImg: c.stamp === "image" ? await load(c.stampFileId) : null, signImg: c.stamp !== "none" ? await load(c.signatureFileId) : null };
}
