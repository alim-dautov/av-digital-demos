"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import { signLink } from "@/lib/sign";
import * as svc from "./service";

const id = z.number().int();
export const createCpAction = action(svc.counterpartyInput, (i, { db, p }) => svc.createCounterparty(db, p, i), { revalidate: ["/counterparties"] });
export const updateCpAction = action(z.object({ id, data: svc.counterpartyInput }), (i, { db, p }) => svc.updateCounterparty(db, p, i.id, i.data), { revalidate: ["/counterparties"] });
export const deleteCpAction = action(z.object({ id }), (i, { db, p }) => svc.deleteCounterparty(db, p, i.id), { revalidate: ["/counterparties"] });
export const searchCpAction = action(z.object({ q: z.string().max(100), kind: z.enum(["client", "supplier"]).optional() }),
  async (i, { db, p }) => (await svc.listCounterparties(db, p, { q: i.q, kind: i.kind, pageSize: 15 })).rows);
/** Публичная ссылка на акт сверки (подпись HMAC, срок 30 дней) */
export const reconLinkAction = action(z.object({ id, from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), side: z.enum(["client", "supplier"]) }),
  async (i, { p }) => {
    const { assertCan } = await import("@/lib/rbac");
    assertCan(p, "counterparties");
    return `${process.env.APP_URL ?? ""}/p/recon/${signLink({ t: "recon", id: i.id, from: i.from, to: i.to, side: i.side }, 30)}`;
  });

/** Личный кабинет клиента: постоянная ссылка, которую можно отозвать */
export const portalLinkAction = action(z.object({ id, regenerate: z.boolean().default(false) }),
  async (i, { db, p }) => {
    const { ensurePortalLink, portalPath } = await import("./portal");
    return `${process.env.APP_URL ?? ""}${portalPath(await ensurePortalLink(db, p, i.id, i.regenerate))}`;
  }, { revalidate: ["/counterparties"] });
export const portalRevokeAction = action(z.object({ id }), async (i, { db, p }) => {
  const { revokePortalLink } = await import("./portal");
  await revokePortalLink(db, p, i.id);
}, { revalidate: ["/counterparties"] });
