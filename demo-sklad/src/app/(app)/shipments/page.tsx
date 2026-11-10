import Link from "next/link";
import { Plus, Search, Truck } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag } from "@/lib/rbac";
import { fmtDate, money, pct } from "@/lib/format";
import { Badge, Card, EmptyState, Input, PageHeader, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { listShipments } from "@/modules/shipments/service";

export const metadata = { title: "Отгрузки и возвраты" };
type SP = { q?: string; kind?: string; from?: string; to?: string; page?: string };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("shipments");
  const sp = await searchParams;
  const db = await getDb();
  const kind = sp.kind === "return" ? "return" : sp.kind === "all" ? undefined : "shipment";
  const list = await listShipments(db, u, { kind, q: sp.q, from: sp.from, to: sp.to, page: Number(sp.page) || 1 });
  const profit = flag(u, "seeProfit");
  const href = (o: Partial<SP>) => `/shipments?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][])}`;
  type R = (typeof list.rows)[number];
  return (
    <>
      <PageHeader title="Отгрузки и возвраты" subtitle="проведённые документы списывают и возвращают остатки"
        actions={can(u, "shipments", "full") && <Link href="/shipments/new" className={buttonClass("primary")}><Plus className="size-4" />Отгрузка без заявки</Link>} />
      <Tabs active={sp.kind ?? "shipment"} items={[{ key: "shipment", label: "Отгрузки", href: href({ kind: "shipment" }) }, { key: "return", label: "Возвраты", href: href({ kind: "return" }) }, { key: "all", label: "Все", href: href({ kind: "all" }) }]} />
      <Card className="overflow-hidden">
        <form className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-[1fr_150px_150px_auto] sm:p-4" action="/shipments">
          {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
          <div className="col-span-2 sm:col-span-1"><Input name="q" defaultValue={sp.q} placeholder="Клиент или номер" icon={<Search />} type="search" /></div>
          <Input type="date" name="from" defaultValue={sp.from} aria-label="С" /><Input type="date" name="to" defaultValue={sp.to} aria-label="По" />
          <button className={buttonClass("secondary")}>Найти</button>
        </form>
        <DataTable<R> rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => `/shipments/${r.id}`}
          empty={<EmptyState icon={<Truck />} title="Документов нет" text="Отгрузки создаются из заявки кнопкой «Создать отгрузку»" />}
          columns={[
            { key: "n", header: "№", cell: (r) => <span className="whitespace-nowrap">{r.kind === "return" ? "В-" : ""}{r.number}</span> },
            { key: "d", header: "Дата", cell: (r) => fmtDate(r.date), className: "whitespace-nowrap" },
            { key: "cp", header: "Клиент", cell: (r) => <span className="block max-w-[260px] truncate">{r.counterpartyName}</span> },
            { key: "o", header: "Заявка", cell: (r) => r.orderNumber ? `№${r.orderNumber}` : <span className="text-ink-3">—</span>, hideMd: true },
            { key: "k", header: "Тип", cell: (r) => r.kind === "return" ? <Badge tone="warning">возврат</Badge> : <Badge tone="info">отгрузка</Badge>, hideMd: true },
            ...(profit ? [{ key: "m", header: "Маржа", align: "right" as const, cell: (r: R) => r.margin != null && r.total ? <span className={r.margin < 0 ? "text-danger" : "text-success"}>{money(r.margin)} <span className="text-xs text-ink-3">{pct((r.margin / r.total) * 100)}</span></span> : "—", hideMd: true }] : []),
            { key: "t", header: "Сумма", align: "right", cell: (r) => <b className={r.kind === "return" ? "text-warning" : ""}>{r.kind === "return" ? "−" : ""}{money(r.total)}</b> },
          ]}
          mobile={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate text-sm font-semibold">{r.kind === "return" ? "Возврат" : "Отгрузка"} №{r.number} · {r.counterpartyName}</p><p className="text-xs text-ink-3">{fmtDate(r.date)}{r.orderNumber ? ` · заявка №${r.orderNumber}` : ""}</p></div>
              <span className={`tnum text-sm font-bold ${r.kind === "return" ? "text-warning" : ""}`}>{money(r.total)}</span>
            </div>
          )} />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => `${href({})}&page=${p}`} />
      </Card>
    </>
  );
}
