"use server";
import { z } from "zod";
import { action } from "@/lib/action";
import * as svc from "./service";

const id = z.number().int();
const rv = { revalidate: ["/payroll", "/finance", "/"] };

export const closePeriodAction = action(z.object({ key: z.string() }), (i, { db, p }) => svc.closePeriod(db, p, i.key), rv);
export const reopenPeriodAction = action(z.object({ key: z.string(), reason: z.string().max(500) }), (i, { db, p }) => svc.reopenPeriod(db, p, i.key, i.reason), rv);
export const saveSchemeAction = action(z.object({ userId: id, validFrom: z.string(), components: z.unknown(), comment: z.string().max(500).optional() }), async (i, { db, p }) => (await svc.saveScheme(db, p, i)).id, rv);
export const saveRuleAction = action(svc.ruleInput, async (i, { db, p }) => (await svc.saveRule(db, p, i)).id, rv);
export const setTimesheetAction = action(z.object({ userId: id, date: z.string(), status: z.enum(["present", "absent", "vacation", "sick", "dayoff", "clear"]), hours: z.number().min(0).max(24) }),
  (i, { db, p }) => svc.setTimesheet(db, p, i), rv);
export const checkInOutAction = action(z.object({}), (_i, { db, p }) => svc.checkInOut(db, p), rv);
export const addAdjustmentAction = action(svc.adjustmentInput, async (i, { db, p }) => (await svc.addAdjustment(db, p, i)).id, rv);
export const penaltyInfoAction = action(z.object({ userId: id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), (i, { db, p }) => svc.penaltyInfo(db, p, i.userId, i.date));
export const deleteAdjustmentAction = action(z.object({ id }), (i, { db, p }) => svc.deleteAdjustment(db, p, i.id), rv);
export const addAdvanceAction = action(svc.payInput, (i, { db, p }) => svc.addAdvance(db, p, i), rv);
export const addPayoutAction = action(svc.payInput, (i, { db, p }) => svc.addPayout(db, p, i), rv);
export const deletePayMoneyAction = action(z.object({ kind: z.enum(["advance", "payout"]), id }), (i, { db, p }) => svc.deletePayMoney(db, p, i.kind, i.id), rv);
