import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "drizzle-orm";
import { CalendarClock, History, Truck } from "lucide-react";
import { getDb } from "@/db";
import { q } from "@/db/sql";
import { requireUser } from "@/lib/auth";
import { can, flag, NotFoundError } from "@/lib/rbac";
import { fmtDate, money, num } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { getProduct, listFolders } from "@/modules/products/service";
import { ProductForm } from "../_components/product-form";

const SOURCES: Record<string, string> = { manual: "вручную", batch: "массово", rollback: "откат", receipt: "из приёмки", import: "импорт" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const [r] = await q<{ name: string }>(db, sql`select name from products where id = ${Number(id) || 0}`);
  return { title: r?.name ?? "Товар" };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser("products");
  const { id } = await params;
  const db = await getDb();
  const pr = await getProduct(db, u, Number(id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const folders = await listFolders(db);
  const users = await q<{ id: number; name: string }>(db, sql`select id, name from users`);
  const uname = (i: number | null) => users.find((x) => x.id === i)?.name ?? "система";
  const tname = (i: number) => pr.priceTypes.find((t) => t.id === i)?.name ?? "";
  const moves = can(u, "stock") ? await q<{ kind: string; id: number; number: number; date: string; qty: number; cp: string }>(db, sql`
    select * from (
      select 'receipt' kind, r.id, r.number, r.date::text date, ri.qty::float8 qty, c.name cp from receipt_items ri join receipts r on r.id = ri.receipt_id join counterparties c on c.id = r.supplier_id
        where ri.product_id = ${pr.id} and r.posted and r.deleted_at is null and not ri.excluded
      union all
      select s.kind, s.id, s.number, s.date::text, (case when s.kind='return' then 1 else -1 end) * si.qty::float8, c.name from shipment_items si join shipments s on s.id = si.shipment_id join counterparties c on c.id = s.counterparty_id
        where si.product_id = ${pr.id} and s.posted and s.deleted_at is null
    ) m order by date desc, id desc limit 15`) : [];
  return (
    <>
      <PageHeader back={<BackLink href={pr.folderId ? `/products?folder=${pr.folderId}` : "/products"}>Товары</BackLink>} title={pr.name}
        subtitle={[pr.sku && `арт. ${pr.sku}`, pr.barcode && `ШК ${pr.barcode}`].filter(Boolean).join(" · ") || undefined} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <ProductForm edit={can(u, "products", "full")} types={pr.priceTypes.map((t) => ({ id: t.id, name: t.name, isPurchase: t.isPurchase }))}
          folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
          initial={{ id: pr.id, name: pr.name, sku: pr.sku, barcode: pr.barcode, unit: pr.unit, description: pr.description, folderId: pr.folderId, minStock: pr.minStock, active: pr.active, photos: pr.photos, prices: Object.fromEntries(Object.entries(pr.prices).map(([k, v]) => [k, v])) }} />
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="p-4 sm:p-5">
            <p className="text-[13px] font-semibold text-ink-3">Остаток на складе</p>
            <p className={`tnum mt-1 text-[32px] font-extrabold tracking-tight ${pr.stock < 0 ? "text-danger" : ""}`}>{num(pr.stock)} <span className="text-lg text-ink-3">{pr.unit}</span></p>
            {pr.stock < 0 && <p className="text-xs font-semibold text-danger">Отгружено больше, чем поступило — проверьте приёмки</p>}
            {pr.minStock > 0 && pr.stock < pr.minStock && pr.stock >= 0 && <Badge tone="warning" className="mt-1">ниже минимума {num(pr.minStock)}</Badge>}
            {pr.incoming && <p className="mt-3 flex items-center gap-2 rounded-xl bg-info-bg px-3 py-2 text-sm text-info"><CalendarClock className="size-4" />Ожидается +{num(pr.incoming.qty)} {pr.unit} к {fmtDate(pr.incoming.eta)}</p>}
          </Card>
          {flag(u, "seePurchase") && (
            <Card>
              <CardHeader title="По чём брали" subtitle="последняя закупка у каждого поставщика" />
              {pr.lastBySupplier.length === 0 ? <p className="px-5 py-4 text-sm text-ink-3">Приёмок ещё не было</p> : (
                <ul className="divide-y divide-line">
                  {pr.lastBySupplier.map((l) => (
                    <li key={l.supplierId}>
                      <Link href={`/receipts/${l.receiptId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
                        <Truck className="size-4 shrink-0 text-ink-3" />
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{l.supplierName}</span><span className="text-xs text-ink-3">приёмка №{l.receiptNumber} · {fmtDate(l.date)}</span></span>
                        <span className="tnum text-sm font-bold">{money(l.price)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
          {moves.length > 0 && (
            <Card>
              <CardHeader title="Движение" subtitle="последние 15 операций" />
              <ul className="divide-y divide-line text-sm">
                {moves.map((m) => (
                  <li key={`${m.kind}${m.id}`}>
                    <Link href={m.kind === "receipt" ? `/receipts/${m.id}` : `/shipments/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5">
                      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.cp}</span><span className="text-xs text-ink-3">{m.kind === "receipt" ? "Приёмка" : m.kind === "return" ? "Возврат" : "Отгрузка"} №{m.number} · {fmtDate(m.date)}</span></span>
                      <span className={`tnum font-bold ${m.qty > 0 ? "text-success" : ""}`}>{m.qty > 0 ? "+" : "−"}{num(Math.abs(m.qty))}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="История цен" />
            {pr.history.length === 0 ? <p className="flex items-center gap-2 px-5 py-4 text-sm text-ink-3"><History className="size-4" />Цены не менялись</p> : (
              <ul className="scroll-thin max-h-96 divide-y divide-line overflow-y-auto text-sm">
                {pr.history.map((h) => (
                  <li key={h.id} className="px-4 py-2.5 sm:px-5">
                    <div className="flex items-center justify-between gap-2"><span className="font-semibold">{tname(h.priceTypeId)}</span><span className="tnum"><span className="text-ink-3">{money(h.oldValue)}</span> → <b>{money(h.newValue)}</b></span></div>
                    <p className="text-xs text-ink-3">{fmtDate(h.createdAt, true)} · {uname(h.userId)} · {SOURCES[h.source] ?? h.source}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
