"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const id = z.number().int();
const fileRef = z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() });
const rv = { revalidate: ["/orders", "/"] };

export const createOrderAction = action(svc.orderInput, async (i, { db, p }) => (await svc.createOrder(db, p, i)).id, rv);
export const updateOrderAction = action(z.object({ id, data: svc.orderInput }), async (i, { db, p }) => (await svc.updateOrder(db, p, i.id, i.data)).id, rv);
export const addItemsAction = action(z.object({ id, items: z.array(svc.orderItemInput).min(1) }), async (i, { db, p }) => (await svc.addItems(db, p, i.id, i.items)).id, rv);
export const setStatusAction = action(z.object({ id, statusId: id, comment: z.string().max(500).optional() }), (i, { db, p }) => svc.setStatus(db, p, i.id, i.statusId, i.comment), rv);
export const rescheduleAction = action(z.object({ id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }), (i, { db, p }) => svc.reschedule(db, p, i.id, i.date), rv);
export const copyOrderAction = action(z.object({ id, discount: z.object({ kind: z.enum(["percent", "amount"]), value: z.number().min(0) }).optional() }),
  async (i, { db, p }) => (await svc.copyOrder(db, p, i.id, i.discount)).id, rv);
export const deleteOrderAction = action(z.object({ id }), (i, { db, p }) => svc.deleteOrder(db, p, i.id), rv);
export const bulkDeleteDraftsAction = action(z.object({ olderThanDays: z.number().int().min(0).max(3650), statusIds: z.array(id), dryRun: z.boolean() }),
  (i, { db, p }) => svc.bulkDeleteDrafts(db, p, i.olderThanDays, i.statusIds, i.dryRun), rv);
export const setItemAssembledAction = action(z.object({ itemId: id, assembled: z.boolean() }), (i, { db, p }) => svc.setItemAssembled(db, p, i.itemId, i.assembled));
export const finishAssemblyAction = action(z.object({ id, photos: z.array(fileRef).default([]) }), (i, { db, p }) => svc.finishAssembly(db, p, i.id, i.photos), rv);
export const parseOrderTextAction = action(z.object({ text: z.string().max(20000), priceTypeId: id.nullable().optional() }), (i, { db, p }) => svc.parseAndMatch(db, p, i.text, i.priceTypeId));
export const defaultPriceTypeAction = action(z.object({ counterpartyId: id }), (i, { db }) => svc.defaultPriceType(db, i.counterpartyId));
