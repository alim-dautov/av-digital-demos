"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import { checkDebtLimit } from "@/modules/counterparties/service";
import * as svc from "./service";

const rv = { revalidate: ["/shipments", "/orders", "/stock", "/counterparties", "/"] };
export const createShipmentAction = action(svc.shipmentInput, async (i, { db, p }) => (await svc.createShipment(db, p, i)).id, rv);
export const deleteShipmentAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.deleteShipment(db, p, i.id), rv);
export const checkDebtAction = action(z.object({ counterpartyId: z.number().int(), amount: z.number().int() }), async (i, { db, p }) => {
  const { assertCan } = await import("@/lib/rbac");
  assertCan(p, "shipments");
  return checkDebtLimit(db, i.counterpartyId, i.amount);
});
