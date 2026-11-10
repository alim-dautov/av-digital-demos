"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import { assertCan } from "@/lib/rbac";
import { signLink } from "@/lib/sign";

/** Публичная ссылка на прайс (подписана, 30 дней) — можно отправить клиенту */
export const priceListLinkAction = action(z.object({ type: z.number().int(), folder: z.number().int().nullable(), instock: z.boolean(), stock: z.boolean() }), async (i, { p }) => {
  assertCan(p, "prices");
  return `${process.env.APP_URL ?? ""}/api/pdf/pricelist?t=${encodeURIComponent(signLink({ t: "pl", ...i }, 30))}`;
});
