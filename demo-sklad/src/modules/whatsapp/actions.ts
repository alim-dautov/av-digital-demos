"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import { audit } from "@/lib/audit";
import { getWhatsApp } from "./provider";

/** Отправка/подготовка сообщения. Для заглушки возвращает ссылку wa.me, клиент открывает её. */
export const whatsappAction = action(z.object({
  to: z.string().max(40).default(""), text: z.string().trim().min(1).max(4000), url: z.string().url().optional(),
  entity: z.string().max(40).optional(), entityId: z.union([z.string(), z.number()]).optional(),
}), async (i, { db, p }) => {
  const wa = getWhatsApp();
  const r = i.url ? await wa.sendDocument(i.to, i.url, i.text) : await wa.sendText(i.to, i.text);
  await audit(db, p, "whatsapp", i.entity ?? "message", i.entityId != null ? String(i.entityId) : null, `WhatsApp (${wa.name}) → ${i.to || "без номера"}: ${i.text.slice(0, 80)}`);
  return r;
});
