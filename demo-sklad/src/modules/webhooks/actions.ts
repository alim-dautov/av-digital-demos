"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const rv = { revalidate: ["/settings"] };
export const saveWebhookAction = action(svc.webhookInput, (i, { db, p }) => svc.saveWebhook(db, p, i), rv);
export const deleteWebhookAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.deleteWebhook(db, p, i.id), rv);
export const testWebhookAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.testWebhook(db, p, i.id), rv);
