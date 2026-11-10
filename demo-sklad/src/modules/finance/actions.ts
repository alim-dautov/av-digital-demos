"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const id = z.number().int();
const rv = { revalidate: ["/payments", "/finance", "/orders", "/counterparties", "/"] };

export const createPaymentAction = action(svc.paymentInput, (i, { db, p }) => svc.createPayment(db, p, i), rv);
export const deletePaymentAction = action(z.object({ id }), (i, { db, p }) => svc.deletePayment(db, p, i.id), rv);
export const createFinTxAction = action(svc.finTxInput, (i, { db, p }) => svc.createFinTx(db, p, i), { revalidate: ["/finance"] });
export const deleteFinTxAction = action(z.object({ id }), (i, { db, p }) => svc.deleteFinTx(db, p, i.id), { revalidate: ["/finance"] });
export const saveAccountAction = action(z.object({ id: id.optional(), name: z.string().trim().min(1).max(100), kind: z.enum(["cash", "kaspi", "bank", "other"]), active: z.boolean().optional() }),
  async (i, { db, p }) => { await svc.saveAccount(db, p, i); }, { revalidate: ["/finance", "/settings"] });
export const saveCategoryAction = action(z.object({ id: id.optional(), name: z.string().trim().min(1).max(100), kind: z.enum(["income", "expense"]) }),
  async (i, { db, p }) => { await svc.saveCategory(db, p, i); }, { revalidate: ["/finance", "/settings"] });
