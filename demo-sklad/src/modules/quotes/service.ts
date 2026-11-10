import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { DB } from "@/db";
import { counterparties, quoteItems, quotes, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { nextNumber } from "@/lib/counters";
import { assertCan, NotFoundError, type Principal } from "@/lib/rbac";
import { roundTenge } from "@/lib/format";

export const quoteInput = z.object({
  counterpartyId: z.number().int().nullable().optional(),
  clientName: z.string().max(300).default(""),
  clientDetails: z.string().max(2000).default(""),
  objectName: z.string().max(300).default(""),
  priceTypeId: z.number().int().nullable().optional(),
  markupPct: z.number().min(0).max(500).default(0),
  validUntil: z.string().nullable().optional(),
  terms: z.string().max(5000).default(""),
  isTemplate: z.boolean().default(false),
  templateName: z.string().max(200).nullable().optional(),
  items: z.array(z.object({
    productId: z.number().int().nullable().optional(), name: z.string().min(1), unit: z.string().default("шт"),
    qty: z.number().positive(), basePrice: z.number().int().min(0),
  })).min(1, "Добавьте позиции"),
});
export type QuoteInput = z.infer<typeof quoteInput>;

/** Наценка закладывается в цену каждой позиции — отдельной строкой клиент её не видит */
export const priceWithMarkup = (base: number, markupPct: number) => roundTenge(base * (1 + markupPct / 100));
export function quoteLines(items: { name: string; unit: string; qty: number; basePrice: number }[], markupPct: number) {
  const lines = items.map((i) => {
    const price = priceWithMarkup(i.basePrice, markupPct);
    return { name: i.name, unit: i.unit, qty: i.qty, price, sum: Math.round(price * i.qty) };
  });
  return { lines, total: lines.reduce((s, l) => s + l.sum, 0) };
}

export async function saveQuote(db: DB, p: Principal, id: number | null, input: QuoteInput) {
  assertCan(p, "prices", "full");
  let clientName = input.clientName;
  if (input.counterpartyId && !clientName) {
    const [c] = await db.select().from(counterparties).where(eq(counterparties.id, input.counterpartyId));
    clientName = c?.name ?? "";
  }
  const total = quoteLines(input.items, input.markupPct).total;
  return db.transaction(async (txx) => {
    const tx = txx as unknown as DB;
    const { items, ...rest } = input;
    const common = {
      ...rest, clientName, total, counterpartyId: input.counterpartyId ?? null, priceTypeId: input.priceTypeId ?? null,
      validUntil: input.validUntil ?? null, templateName: input.templateName ?? null,
    };
    let qid = id;
    if (qid) {
      await tx.update(quotes).set(common).where(eq(quotes.id, qid));
      await tx.delete(quoteItems).where(eq(quoteItems.quoteId, qid));
    } else {
      const number = await nextNumber(tx, "quote");
      const [qq] = await tx.insert(quotes).values({ ...common, number, shareToken: randomBytes(16).toString("base64url"), authorId: p.id }).returning();
      qid = qq.id;
      await audit(tx, p, "create", "quote", qid, `КП №${number} для «${clientName}»`);
    }
    await tx.insert(quoteItems).values(items.map((i, idx) => ({ ...i, productId: i.productId ?? null, quoteId: qid!, sort: idx })));
    return qid!;
  });
}

/** p = null — публичный просмотр по токену: без базовых цен и наценки */
export async function getQuote(db: DB, p: Principal | null, id: number, token?: string) {
  if (p) assertCan(p, "prices");
  const [qq] = await db.select().from(quotes).where(and(eq(quotes.id, id), isNull(quotes.deletedAt)));
  if (!qq || (!p && qq.shareToken !== token)) throw new NotFoundError("КП не найдено");
  const items = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.sort));
  const [author] = await db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, qq.authorId));
  const { lines, total } = quoteLines(items, qq.markupPct);
  return { ...qq, markupPct: p ? qq.markupPct : null, items: p ? items : null, lines, total, author: author ?? null };
}

export async function listQuotes(db: DB, p: Principal) {
  assertCan(p, "prices");
  return db.select({
    id: quotes.id, number: quotes.number, clientName: quotes.clientName, objectName: quotes.objectName, total: quotes.total, validUntil: quotes.validUntil,
    createdAt: quotes.createdAt, isTemplate: quotes.isTemplate, templateName: quotes.templateName, shareToken: quotes.shareToken, authorName: users.name,
  }).from(quotes).innerJoin(users, eq(users.id, quotes.authorId)).where(isNull(quotes.deletedAt)).orderBy(desc(quotes.createdAt)).limit(200);
}

export async function deleteQuote(db: DB, p: Principal, id: number) {
  assertCan(p, "prices", "full");
  await db.update(quotes).set({ deletedAt: new Date() }).where(eq(quotes.id, id));
  await audit(db, p, "delete", "quote", id, `Удалено КП #${id}`);
}
