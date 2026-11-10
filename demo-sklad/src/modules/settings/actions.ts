"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const rv = { revalidate: ["/settings", "/"] };
export const saveCompanyAction = action(svc.companyInput, (i, { db, p }) => svc.saveCompany(db, p, i), rv);
export const saveParamsAction = action(svc.paramsInput, (i, { db, p }) => svc.saveParams(db, p, i), rv);
export const savePriceTypeAction = action(svc.priceTypeInput, (i, { db, p }) => svc.savePriceType(db, p, i), rv);
export const saveStatusAction = action(svc.statusInput, (i, { db, p }) => svc.saveStatus(db, p, i), rv);
export const deleteStatusAction = action(z.object({ id: z.number().int() }), (i, { db, p }) => svc.deleteStatus(db, p, i.id), rv);
export const saveSynonymsAction = action(svc.synonymsInput, (i, { db, p }) => svc.saveSynonyms(db, p, i), rv);
