"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const id = z.number().int();
export const createLeadAction = action(svc.leadInput, (i, { db, p }) => svc.createLead(db, p, i), { revalidate: ["/pipeline", "/"] });
export const updateLeadAction = action(z.object({ id, data: svc.leadInput }), (i, { db, p }) => svc.updateLead(db, p, i.id, i.data), { revalidate: ["/pipeline"] });
export const moveLeadAction = action(z.object({ id, stageId: id, sort: z.number(), lostReason: z.string().max(500).optional() }), (i, { db, p }) => svc.moveLead(db, p, i.id, i.stageId, i.sort, i.lostReason));
export const commentLeadAction = action(z.object({ id, text: z.string().trim().min(1).max(5000), type: z.enum(["comment", "call"]).default("comment") }), (i, { db, p }) => svc.commentLead(db, p, i.id, i.text, i.type));
export const deleteLeadAction = action(z.object({ id }), (i, { db, p }) => svc.deleteLead(db, p, i.id), { revalidate: ["/pipeline"] });
export const getLeadAction = action(z.object({ id }), (i, { db, p }) => svc.getLead(db, p, i.id));
export const convertLeadAction = action(z.object({ id }), (i, { db, p }) => svc.convertLead(db, p, i.id), { revalidate: ["/pipeline", "/orders"] });
