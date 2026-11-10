"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const rv = { revalidate: ["/prices"] };
export const saveQuoteAction = action(z.object({ id: z.number().int().nullable(), data: svc.quoteInput }), (i, { db, p }) => svc.saveQuote(db, p, i.id, i.data), rv);
export const deleteQuoteAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.deleteQuote(db, p, i.id), rv);
