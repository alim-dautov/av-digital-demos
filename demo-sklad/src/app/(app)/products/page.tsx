import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { ProductsSearch } from "./_components/products-search";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate } from "@/lib/format";
import { Card, PageHeader, buttonClass } from "@/components/ui";
import { Pagination } from "@/components/ui/table";
import { lastBatch, listFolders, listProducts, visiblePriceTypes } from "@/modules/products/service";
import { FolderTree } from "./_components/folder-tree";
import { ProductsTable } from "./_components/products-table";
import { ImportButton, RollbackButton } from "./_components/toolbar";

export const metadata = { title: "Товары" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string; page?: string; low?: string }> }) {
  const u = await requireUser("products");
  const sp = await searchParams;
  const db = await getDb();
  const folderId = sp.folder ? Number(sp.folder) : null;
  const page = Number(sp.page) || 1;
  const [folders, types, list, batch] = await Promise.all([
    listFolders(db), visiblePriceTypes(db, u),
    listProducts(db, u, { q: sp.q, folderId, page, pageSize: 50, lowStock: sp.low === "1" }),
    lastBatch(db),
  ]);
  const edit = can(u, "products", "full");
  const qs = (o: Record<string, string | number | undefined | null>) => {
    const s = new URLSearchParams();
    const all = { q: sp.q, folder: sp.folder, low: sp.low, ...o };
    for (const [k, v] of Object.entries(all)) if (v != null && v !== "") s.set(k, String(v));
    const r = s.toString();
    return r ? `/products?${r}` : "/products";
  };
  const current = folders.find((f) => f.id === folderId);
  return (
    <>
      <PageHeader
        title={current ? current.name : "Товары"}
        subtitle={`${list.total} ${list.total === 1 ? "позиция" : "позиций"}${sp.q ? ` по запросу «${sp.q}»` : ""}`}
        actions={<>
          {edit && batch && <RollbackButton id={batch.id} label={`${batch.description || "Массовая смена цен"} · ${fmtDate(batch.createdAt, true)}`} count={batch.changes.length} />}
          {edit && <ImportButton />}
          <a href={`/api/products/export?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.folder ? { folder: sp.folder } : {}) })}`} className={buttonClass("secondary", "md")}><Download className="size-4" />Excel</a>
          {edit && <Link href="/products/new" className={buttonClass("primary", "md")}><Plus className="size-4" />Товар</Link>}
        </>}
      />
      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <FolderTree folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, count: f.count }))} active={folderId} edit={edit} q={sp.q} />
        <Card className="min-w-0 overflow-hidden">
          <form className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4" action="/products">
            {sp.folder && <input type="hidden" name="folder" value={sp.folder} />}
            <div className="min-w-0 flex-1 basis-full sm:basis-0"><ProductsSearch q={sp.q} /></div>
            <label className="flex h-11 flex-1 items-center sm:flex-none gap-2 rounded-xl border border-line px-3 text-sm font-medium text-ink-2">
              <input type="checkbox" name="low" value="1" defaultChecked={sp.low === "1"} className="size-4 accent-[var(--yellow)]" />Ниже минимума
            </label>
            <button className={buttonClass("secondary", "md")}>Найти</button>
          </form>
          <ProductsTable
            rows={list.rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, unit: r.unit, stock: r.stock, minStock: r.minStock, active: r.active, prices: r.prices }))}
            types={types.map((t) => ({ id: t.id, name: t.name, isPurchase: t.isPurchase }))}
            folders={folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))}
            edit={edit}
            filter={{ q: sp.q, folderId: folderId ?? undefined, total: list.total }}
          />
          <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => qs({ page: p })} />
        </Card>
      </div>
    </>
  );
}
