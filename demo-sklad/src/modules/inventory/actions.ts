"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const rv = { revalidate: ["/stock", "/products"] };
export const createInventoryAction = action(svc.inventoryInput, async (i, { db, p }) => (await svc.createInventory(db, p, i)).id, rv);
export const postInventoryAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.postInventory(db, p, i.id), rv);
