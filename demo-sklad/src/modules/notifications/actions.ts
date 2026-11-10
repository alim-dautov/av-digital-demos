"use server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { action } from "@/lib/action";
import { markRead } from "./service";

/** Настройки уведомлений сотрудника: ключ типа (в приложении) и push_<тип> (push). false — выключено. */
export const saveNotifyPrefsAction = action(z.object({ prefs: z.record(z.string().max(40), z.boolean()) }), async (i, { db, p }) => {
  await db.update(users).set({ notifyPrefs: i.prefs }).where(eq(users.id, p.id));
}, { revalidate: ["/notifications"] });

export const markAllReadAction = action(z.object({ id: z.number().int().optional() }), (i, { db, p }) => markRead(db, p.id, i.id), { revalidate: ["/notifications"] });
