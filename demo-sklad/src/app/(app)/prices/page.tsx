import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { Badge, Card, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { DataTable, Tabs } from "@/components/ui/table";
import { listFolders, visiblePriceTypes } from "@/modules/products/service";
import { listQuotes } from "@/modules/quotes/service";
import { PriceListBuilder } from "./_components/pricelist-builder";

export const metadata = { title: "Прайсы и КП" };

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser("prices");
  const tab = (await searchParams).tab ?? "lists";
  const db = await getDb();
  const full = can(u, "prices", "full");
  const types = (await visiblePriceTypes(db, u)).filter((t) => !t.isPurchase).map((t) => ({ id: t.id, name: t.name }));
  const folders = await listFolders(db);
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = (id: number): string => { const f = byId.get(id)!; return f.parentId ? `${path(f.parentId)} / ${f.name}` : f.name; };
  const quotes = tab === "lists" ? [] : await listQuotes(db, u);
  const rows = quotes.filter((q) => (tab === "templates" ? q.isTemplate : !q.isTemplate));
  type R = (typeof rows)[number];
  return (
    <>
      <PageHeader title="Прайсы и КП" subtitle="прайс-листы для базара и магазинов, коммерческие предложения со скрытой наценкой"
        actions={full && <Link href="/prices/quotes/new" className={buttonClass("primary")}><Plus className="size-4" />Новое КП</Link>} />
      <Tabs active={tab} items={[{ key: "lists", label: "Прайс-листы", href: "/prices" }, { key: "quotes", label: "КП", href: "/prices?tab=quotes" }, { key: "templates", label: "Шаблоны КП", href: "/prices?tab=templates" }]} />
      {tab === "lists" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <PriceListBuilder types={types} folders={folders.map((f) => ({ id: f.id, path: path(f.id) })).sort((a, b) => a.path.localeCompare(b.path, "ru"))} />
          <Card>
            <CardHeader title="Быстрые прайсы" />
            <ul className="divide-y divide-line">
              {types.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <span className="font-semibold">{t.name}</span>
                  <span className="flex gap-2">
                    <a href={`/api/pdf/pricelist?type=${t.id}&stock=1`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>PDF</a>
                    <a href={`/api/pdf/pricelist?type=${t.id}&instock=1`} target="_blank" rel="noreferrer" className={buttonClass("ghost", "sm")}>в наличии</a>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : (
        <Card className="overflow-hidden">
          <DataTable<R> rows={rows} rowKey={(r) => r.id} rowHref={(r) => (tab === "templates" ? `/prices/quotes/new?from=${r.id}` : `/prices/quotes/${r.id}`)}
            empty={<EmptyState icon={<FileText />} title={tab === "templates" ? "Шаблонов нет" : "КП ещё не создавались"} text={tab === "templates" ? "Отметьте «Сохранить как шаблон» при создании КП" : undefined} />}
            columns={tab === "templates" ? [
              { key: "n", header: "Шаблон", cell: (r) => <b>{r.templateName}</b> },
              { key: "o", header: "Объект", cell: (r) => r.objectName || "—" },
              { key: "t", header: "Сумма", align: "right", cell: (r) => money(r.total) },
              { key: "a", header: "", cell: () => <Badge tone="info">создать КП</Badge> },
            ] : [
              { key: "n", header: "№", cell: (r) => r.number },
              { key: "d", header: "Дата", cell: (r) => fmtDate(r.createdAt), className: "whitespace-nowrap" },
              { key: "c", header: "Клиент", cell: (r) => <span className="block max-w-[240px] truncate">{r.clientName || "—"}</span> },
              { key: "o", header: "Объект", cell: (r) => r.objectName || "—", hideMd: true },
              { key: "v", header: "До", cell: (r) => r.validUntil ? <span className={r.validUntil < new Date().toISOString().slice(0, 10) ? "text-ink-3 line-through" : ""}>{fmtDate(r.validUntil)}</span> : "—", hideMd: true },
              { key: "a", header: "Менеджер", cell: (r) => r.authorName, hideMd: true },
              { key: "t", header: "Сумма", align: "right", cell: (r) => <b>{money(r.total)}</b> },
            ]}
            mobile={(r) => <div className="flex justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.isTemplate ? r.templateName : `КП №${r.number} · ${r.clientName}`}</p><p className="text-xs text-ink-3">{r.objectName || fmtDate(r.createdAt)}</p></div><b className="tnum text-sm">{money(r.total)}</b></div>} />
        </Card>
      )}
    </>
  );
}
