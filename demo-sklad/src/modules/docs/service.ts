import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { DB } from "@/db";
import { docVersions, files, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { money, num } from "@/lib/format";
import { assertCan, NotFoundError, ValidationError, type ModuleKey, type Principal } from "@/lib/rbac";
import { newKey, storage } from "@/lib/storage";
import { orderPdf, quotePdf, shipmentPdf, type VersionMark } from "@/lib/pdf/docs";
import { docCompany } from "@/lib/pdf/company";
import { getOrder } from "@/modules/orders/service";
import { getShipment } from "@/modules/shipments/service";
import { getQuote } from "@/modules/quotes/service";

/**
 * Версии документов для клиента. Каждая отправка = отдельный неизменяемый PDF (v1, v2, …) со своей ссылкой:
 * клиент получает файл, а не «живую» ссылку, и может сравнить версии. В PDF печатается, что изменилось с прошлой.
 */
export const DOC_ENTITIES = ["order", "shipment", "quote"] as const;
export type DocEntity = (typeof DOC_ENTITIES)[number];
const MODULE_OF: Record<DocEntity, ModuleKey> = { order: "orders", shipment: "shipments", quote: "prices" };
export const docInput = z.object({ entity: z.enum(DOC_ENTITIES), id: z.coerce.number().int().positive() });

type Line = { name: string; unit: string; qty: number; price: number };
type Built = { title: string; fileBase: string; lines: Line[]; total: number; render: (v: VersionMark) => Promise<Buffer> };

const clientDetails = (c: { bin?: string | null; address?: string | null }) => [c.bin && `БИН/ИИН ${c.bin}`, c.address].filter(Boolean).join(", ");

async function build(db: DB, p: Principal, entity: DocEntity, id: number): Promise<Built> {
  const company = await docCompany(db);
  if (entity === "order") {
    const o = await getOrder(db, p, id);
    const lines = o.items.map((i) => ({ name: i.name, unit: i.unit, qty: Number(i.qty), price: i.price }));
    return {
      title: `Заказ №${o.number}`, fileBase: `Заказ_${o.number}`, lines, total: o.total,
      render: (version) => orderPdf(company, {
        number: o.number, date: o.createdAt, deliveryDate: o.deliveryDate, discountPct: o.discountPct, total: o.total, comment: o.comment, manager: o.managerName,
        client: { name: o.counterparty.name, phone: o.counterparty.phone, details: clientDetails(o.counterparty) }, items: lines, version,
      }),
    };
  }
  if (entity === "shipment") {
    const sh = await getShipment(db, p, id);
    const ret = sh.kind === "return";
    const lines = sh.items.map((i) => ({ name: i.name, unit: i.unit, qty: Number(i.qty), price: i.price }));
    return {
      title: `${ret ? "Возврат" : "Накладная"} №${sh.number}`, fileBase: `${ret ? "Возврат" : "Накладная"}_${sh.number}`, lines, total: sh.total,
      render: (version) => shipmentPdf(company, {
        kind: sh.kind, number: sh.number, date: sh.date, orderNumber: sh.order?.number, total: sh.total, comment: sh.comment,
        client: { name: sh.counterparty.name, phone: sh.counterparty.phone, details: clientDetails(sh.counterparty) }, items: lines, version,
      }),
    };
  }
  const qq = await getQuote(db, p, id);
  if (qq.isTemplate) throw new ValidationError("Шаблон КП нельзя отправить клиенту — создайте КП из шаблона");
  return {
    title: `КП №${qq.number}`, fileBase: `КП_${qq.number}`, lines: qq.lines.map((l) => ({ name: l.name, unit: l.unit, qty: Number(l.qty), price: l.price })), total: qq.total,
    render: (version) => quotePdf(company, {
      number: qq.number, date: qq.createdAt.toISOString().slice(0, 10), clientName: qq.clientName, clientDetails: qq.clientDetails, objectName: qq.objectName,
      validUntil: qq.validUntil, terms: qq.terms, lines: qq.lines, total: qq.total, author: qq.author, version,
    }),
  };
}

const hashOf = (lines: Line[], total: number) => createHash("sha256").update(JSON.stringify([lines.map((l) => [l.name, l.unit, l.qty, l.price]), total])).digest("hex");

/** Что изменилось между версиями: позиции сопоставляются по наименованию и единице */
export function diffLines(prev: Line[], next: Line[], prevTotal: number, nextTotal: number): string[] {
  const key = (l: Line) => `${l.name.trim().toLowerCase()}|${l.unit}`;
  const before = new Map(prev.map((l) => [key(l), l]));
  const after = new Map(next.map((l) => [key(l), l]));
  const out: string[] = [];
  for (const [k, l] of after) {
    const b = before.get(k);
    if (!b) { out.push(`Добавлено: ${l.name} — ${num(l.qty)} ${l.unit} × ${money(l.price)}`); continue; }
    if (b.qty !== l.qty) out.push(`${l.name}: количество было ${num(b.qty)}, стало ${num(l.qty)} ${l.unit}`);
    if (b.price !== l.price) out.push(`${l.name}: цена была ${money(b.price)}, стала ${money(l.price)}`);
  }
  for (const [k, l] of before) if (!after.has(k)) out.push(`Удалено: ${l.name} — ${num(l.qty)} ${l.unit}`);
  if (prevTotal !== nextTotal) out.push(`Итого было ${money(prevTotal)}, стало ${money(nextTotal)}`);
  return out;
}

export const docUrl = (token: string) => `/p/doc/${token}`;

/**
 * Сформировать версию для отправки. Если с прошлой версии ничего не поменялось — возвращается она же (reused),
 * чтобы клиенту не уходили одинаковые «v3, v4».
 */
export async function createDocVersion(db: DB, p: Principal, entity: DocEntity, id: number) {
  const b = await build(db, p, entity, id); // права проверяет сервис документа
  if (!b.lines.length) throw new ValidationError("В документе нет позиций");
  const hash = hashOf(b.lines, b.total);
  const [last] = await db.select().from(docVersions).where(and(eq(docVersions.entity, entity), eq(docVersions.entityId, id))).orderBy(desc(docVersions.version)).limit(1);
  if (last && last.hash === hash) {
    return { id: last.id, version: last.version, url: docUrl(last.token), fileName: `${b.fileBase}_v${last.version}.pdf`, title: last.title, reused: true, changes: [] as string[] };
  }
  const n = (last?.version ?? 0) + 1;
  const changes = last ? diffLines(last.lines, b.lines, last.total, b.total) : [];
  const at = new Date();
  const buf = await b.render({ n, at, changes, prev: last?.version });
  const fileName = `${b.fileBase}_v${n}.pdf`;
  const key = newKey(fileName);
  await storage().put(key, buf, "application/pdf");
  const token = randomBytes(18).toString("base64url");
  const title = `${b.title} · версия ${n}`;
  const row = await db.transaction(async (tx) => {
    const [f] = await tx.insert(files).values({ key, name: fileName, mime: "application/pdf", size: buf.length, uploadedBy: p.id }).returning({ id: files.id });
    const [v] = await tx.insert(docVersions).values({ entity, entityId: id, version: n, fileId: f.id, token, title, total: b.total, lines: b.lines, hash, createdBy: p.id, createdAt: at }).returning();
    return v;
  });
  await audit(db, p, "send", entity, id, `Сформирована ${title} для клиента`);
  return { id: row.id, version: n, url: docUrl(token), fileName, title, reused: false, changes };
}

/** История версий документа: новые сверху, с перечнем изменений к предыдущей */
export async function listDocVersions(db: DB, p: Principal, entity: DocEntity, id: number) {
  assertCan(p, MODULE_OF[entity]);
  const rows = await db.select({ v: docVersions, author: users.name }).from(docVersions).leftJoin(users, eq(users.id, docVersions.createdBy))
    .where(and(eq(docVersions.entity, entity), eq(docVersions.entityId, id))).orderBy(desc(docVersions.version));
  return rows.map(({ v, author }, i) => {
    const prev = rows[i + 1]?.v;
    return { id: v.id, version: v.version, createdAt: v.createdAt, author, total: v.total, items: v.lines.length, url: docUrl(v.token), changes: prev ? diffLines(prev.lines, v.lines, prev.total, v.total) : [] };
  });
}

/** Публичное чтение по токену: файл ровно в том виде, в каком его отправили */
export async function docVersionByToken(db: DB, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) throw new NotFoundError("Документ не найден");
  const [r] = await db.select({ v: docVersions, f: files }).from(docVersions).innerJoin(files, eq(files.id, docVersions.fileId)).where(eq(docVersions.token, token));
  if (!r) throw new NotFoundError("Документ не найден");
  const buf = await storage().get(r.f.key);
  if (!buf) throw new NotFoundError("Файл документа не найден в хранилище");
  return { buf, name: r.f.name, title: r.v.title };
}
