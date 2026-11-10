import { and, desc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { notes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { assertCan, ForbiddenError, NotFoundError, type Principal } from "@/lib/rbac";

export const noteInput = z.object({
  title: z.string().trim().min(1, "Укажите заголовок").max(300),
  body: z.string().max(100000).default(""),
  folder: z.string().max(100).default(""),
  tags: z.array(z.string().trim().min(1).max(30)).default([]),
  pinned: z.boolean().default(false),
  visibility: z.enum(["all", "selected", "private"]).default("all"),
  visibleTo: z.array(z.number().int()).default([]),
  attachments: z.array(z.object({ id: z.number(), name: z.string(), mime: z.string(), size: z.number() })).default([]),
});
export type NoteInput = z.infer<typeof noteInput>;

function visible(p: Principal): SQL {
  return sql`(${notes.authorId} = ${p.id} or ${notes.visibility} = 'all' or (${notes.visibility} = 'selected' and ${notes.visibleTo} @> ${JSON.stringify([p.id])}::jsonb))`;
}

export async function listNotes(db: DB, p: Principal, params: { q?: string; folder?: string; tag?: string } = {}) {
  assertCan(p, "notes");
  const conds: (SQL | undefined)[] = [isNull(notes.deletedAt), visible(p)];
  if (params.q) conds.push(sql`(lower(${notes.title}) like ${"%" + params.q.toLowerCase() + "%"} or lower(${notes.body}) like ${"%" + params.q.toLowerCase() + "%"})`);
  if (params.folder) conds.push(eq(notes.folder, params.folder));
  if (params.tag) conds.push(sql`${notes.tags} @> ${JSON.stringify([params.tag])}::jsonb`);
  const rows = await db.select({ n: notes, authorName: users.name }).from(notes).innerJoin(users, eq(users.id, notes.authorId))
    .where(and(...conds)).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(300);
  const folders = await db.execute(sql`select distinct folder from notes where deleted_at is null and folder <> '' order by folder`);
  return { rows: rows.map((r) => ({ ...r.n, authorName: r.authorName })), folders: (((folders as unknown as { rows: { folder: string }[] }).rows) ?? []).map((f) => f.folder) };
}

export async function getNote(db: DB, p: Principal, id: number) {
  assertCan(p, "notes");
  const [n] = await db.select().from(notes).where(and(eq(notes.id, id), isNull(notes.deletedAt), visible(p)));
  if (!n) throw new NotFoundError("Заметка не найдена");
  return n;
}

export async function saveNote(db: DB, p: Principal, id: number | null, input: NoteInput) {
  assertCan(p, "notes", "full");
  if (id) {
    const n0 = await getNote(db, p, id);
    if (n0.authorId !== p.id && !p.isOwner) throw new ForbiddenError("Редактировать может автор");
    const [n] = await db.update(notes).set({ ...input, updatedAt: new Date() }).where(eq(notes.id, id)).returning();
    return n;
  }
  const [n] = await db.insert(notes).values({ ...input, authorId: p.id }).returning();
  await audit(db, p, "create", "note", n.id, `Заметка «${n.title}»`);
  return n;
}

export async function deleteNote(db: DB, p: Principal, id: number) {
  const n = await getNote(db, p, id);
  if (n.authorId !== p.id && !p.isOwner) throw new ForbiddenError("Удалить может автор");
  await db.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, id));
  await audit(db, p, "delete", "note", id, `Удалена заметка «${n.title}»`);
}
