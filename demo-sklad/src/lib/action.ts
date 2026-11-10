import "server-only";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getDb, type DB } from "@/db";
import { getSessionUser } from "./auth";
import type { Principal } from "./rbac";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Обёртка серверного действия: проверка сессии, валидация zod, единый формат ошибок.
 * Права проверяются внутри сервисов (assertCan/assertFlag), чтобы одинаково работать для UI, REST и MCP.
 */
export function action<S extends z.ZodType, T>(
  schema: S,
  fn: (input: z.infer<S>, ctx: { db: DB; p: Principal }) => Promise<T>,
  opts: { revalidate?: string[] } = {},
) {
  return async (raw: z.input<S>): Promise<ActionResult<T>> => {
    try {
      const u = await getSessionUser();
      if (!u || u.mustChangePassword) return { ok: false, error: "Сессия истекла, войдите снова" };
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: zodMessage(parsed.error) };
      const db = await getDb();
      const data = await fn(parsed.data, { db, p: u });
      for (const path of opts.revalidate ?? []) revalidatePath(path, "layout");
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  };
}

export function zodMessage(err: z.ZodError) {
  const i = err.issues[0];
  return i ? `${i.path.length ? i.path.join(".") + ": " : ""}${i.message}` : "Неверные данные";
}

export function errorMessage(e: unknown) {
  if (e && typeof e === "object" && "status" in e && "message" in e) return String((e as unknown as Error).message);
  console.error(e);
  return "Внутренняя ошибка сервера";
}
