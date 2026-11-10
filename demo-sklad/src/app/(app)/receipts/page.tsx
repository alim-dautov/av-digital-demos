import Link from "next/link";
import { PackagePlus, Plus, Search } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag } from "@/lib/rbac";
import { fmtDate, money } from "@/lib/format";
import { Badge, Card, EmptyState, Input, PageHeader, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { listReceipts } from "@/modules/receipts/service";

export const metadata = { title: "Приёмки" };
type SP = { q?: string; st?: string; page?: string };

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("receipts");
  const sp = await searchParams;
  const db = await getDb();
  const posted = sp.st === "draft" ? false : sp.st === "posted" ? true : undefined;
  const list = await listReceipts(db, u, { q: sp.q, posted, page: Number(sp.page) || 1 });
  const href = (o: Partial<SP>) => `/receipts?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const canCreate = can(u, "receipts", "full") && flag(u, "seePurchase");
  type R = (typeof list.rows)[number];
  const status = (r: R) => !r.posted ? <Badge tone="neutral">черновик</Badge> : r.future ? <Badge tone="info">ожидается</Badge> : <Badge tone="success">проведена</Badge>;
  return (
    <>
      <PageHeader title="Приёмки" subtitle="поступления товара от поставщиков"
        actions={canCreate && <Link href="/receipts/new" className={buttonClass("primary")}><Plus className="size-4" />Новая приёмка</Link>} />
      <Tabs active={sp.st ?? "all"} items={[{ key: "all", label: "Все", href: href({ st: undefined }) }, { key: "posted", label: "Проведённые", href: href({ st: "posted" }) }, { key: "draft", label: "Черновики", href: href({ st: "draft" }) }]} />
      <Card className="overflow-hidden">
        <form className="flex gap-2 border-b border-line p-3 sm:p-4" action="/receipts">
          {sp.st && <input type="hidden" name="st" value={sp.st} />}
          <div className="flex-1"><Input name="q" defaultValue={sp.q} placeholder="Поставщик, № приёмки или накладной" icon={<Search />} type="search" /></div>
          <button className={buttonClass("secondary")}>Найти</button>
        </form>
        <DataTable<R> rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => `/receipts/${r.id}`}
          empty={<EmptyState icon={<PackagePlus />} title="Приёмок нет" text="Загрузите накладную поставщика — позиции распознаются автоматически" />}
          columns={[
            { key: "n", header: "№", cell: (r) => r.number },
            { key: "d", header: "Дата", cell: (r) => fmtDate(r.date), className: "whitespace-nowrap" },
            { key: "s", header: "Поставщик", cell: (r) => <span className="block max-w-[260px] truncate">{r.supplierName}</span> },
            { key: "doc", header: "Накладная", cell: (r) => r.supplierDocNumber ?? <span className="text-ink-3">—</span>, hideMd: true },
            { key: "c", header: "Позиций", align: "right", cell: (r) => r.itemsCount, hideMd: true },
            { key: "st", header: "Статус", cell: status },
            { key: "t", header: "Сумма", align: "right", cell: (r) => r.total != null ? <b>{money(r.total)}</b> : "—" },
          ]}
          mobile={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">№{r.number} · {r.supplierName}</p><p className="flex items-center gap-2 text-xs text-ink-3">{fmtDate(r.date)} · {r.itemsCount} поз. {status(r)}</p></div>
              {r.total != null && <span className="tnum text-sm font-bold">{money(r.total)}</span>}
            </div>
          )} />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => `${href({})}&page=${p}`} />
      </Card>
    </>
  );
}
