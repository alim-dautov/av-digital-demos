"use server";
import { action } from "@/lib/action";
import { createDocVersion, docInput } from "./service";

/** Сформировать (или взять последнюю неизменённую) версию документа для отправки клиенту */
export const sendDocVersionAction = action(docInput, async (i, { db, p }) => {
  const r = await createDocVersion(db, p, i.entity, i.id);
  return { ...r, absUrl: `${process.env.APP_URL ?? ""}${r.url}` };
}, { revalidate: ["/orders", "/shipments", "/prices"] });
