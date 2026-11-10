import Link from "next/link";
import { sql } from "drizzle-orm";
import { ClipboardList, PackageCheck, Plus, Search } from "lucide-react";
import { getDb } from "@/db";
import { q } from "@/db/sql";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, money, today } from "@/lib/format";
import { Badge, Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { listOrders, statuses } from "@/modules/orders/service";
import { salesManagers } from "@/modules/counterparties/service";
import { BulkDrafts } from "./_components/bulk-drafts";

export const metadata = { title: "Заявки" };

type SP = { q?: string; status?: string; manager?: string; from?: string; to?: string; page?: string; assembly?: string; report?: string };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("orders");
  const sp = await searchParams;
  const db = await getDb();
  const sts = await statuses(db);
  const counts = await q<{ status_id: number; c: number }>(db, sql`select status_id, count(*)::int c from orders where deleted_at is null group by status_id`);
  const [{ asm }] = await q<{ asm: number }>(db, sql`select count(*)::int asm from orders o join order_statuses s on s.id = o.status_id where o.deleted_at is null and o.assembly_status <> 'assembled' and not s.is_final and not s.is_cancelled and s.code <> 'new'`);
  const managers = await salesManagers(db);
  const list = await listOrders(db, u, {
    q: sp.q, statusId: sp.status ? Number(sp.status) : undefined, managerId: sp.manager ? Number(sp.manager) : undefined, from: sp.from, to: sp.to,
    page: Number(sp.page) || 1, pageSize: 30, assembly: sp.assembly === "todo" ? "todo" : undefined, deliveredNoShipment: sp.report === "noship",
  });
  const href = (o: Partial<SP>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: sp.q, manager: sp.manager, from: sp.from, to: sp.to, ...o })) if (v) s.set(k, String(v));
    const r = s.toString();
    return r ? `/orders?${r}` : "/orders";
  };
  const active = sp.assembly === "todo" ? "asm" : sp.report === "noship" ? "noship" : sp.status ?? "all";
  const d = today();
  type R = (typeof list.rows)[number];
  const assemblyMode = sp.assembly === "todo";
  return (
    <>
      <PageHeader title={assemblyMode ? "Режим сборщика" : sp.report === "noship" ? "Доставлены без отгрузки" : "Заявки"}
        subtitle={assemblyMode ? "заявки, которые нужно собрать" : sp.report === "noship" ? "статус «Доставлен/Оплачен», но отгрузка не проведена — склад не списан" : `${list.total} шт.`}
        actions={<>
          {can(u, "orders", "full") && !assemblyMode && <BulkDrafts statuses={sts.filter((s) => !s.isFinal).map((s) => ({ id: s.id, name: s.name, code: s.code }))} />}
          {can(u, "orders", "full") && <Link href="/orders/new" className={buttonClass("accent")}><Plus className="size-4" />Новая заявка</Link>}
        </>} />
      <Tabs active={active} items={[
        { key: "all", label: "Все", href: href({}) },
        ...sts.map((s) => ({ key: String(s.id), label: s.name, href: href({ status: String(s.id) }), count: counts.find((c) => c.status_id === s.id)?.c ?? 0 })),
        { key: "asm", label: <span className="inline-flex items-center gap-1.5"><PackageCheck className="size-4" />Сборка</span>, href: "/orders?assembly=todo", count: asm },
        { key: "noship", label: "Без отгрузки", href: href({ report: "noship" }) },
      ]} />
      <Card className="overflow-hidden">
        {!assemblyMode && (
          <form className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-[1fr_170px_150px_150px_auto] sm:p-4" action="/orders">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            {sp.report && <input type="hidden" name="report" value={sp.report} />}
            <div className="col-span-2 sm:col-span-1"><Input name="q" defaultValue={sp.q} placeholder="Клиент, номер или комментарий" icon={<Search />} type="search" /></div>
            <Select name="manager" defaultValue={sp.manager ?? ""} aria-label="Менеджер"><option value="">Все менеджеры</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
            <Input type="date" name="from" defaultValue={sp.from} aria-label="С" />
            <Input type="date" name="to" defaultValue={sp.to} aria-label="По" />
            <button className={buttonClass("secondary")}>Найти</button>
          </form>
        )}
        <DataTable<R>
          rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => `/orders/${r.id}${assemblyMode ? "?mode=assembly" : ""}`}
          empty={<EmptyState icon={<ClipboardList />} title={assemblyMode ? "Всё собрано 👍" : "Заявок нет"} text={assemblyMode ? "Новые заявки для сборки появятся здесь" : "Создайте заявку кнопкой «Новая заявка» или «+»"} />}
          columns={[
            { key: "n", header: "№", cell: (r) => `№${r.number}`, className: "w-20" },
            { key: "cp", header: "Клиент", cell: (r) => <span className="block max-w-[280px] truncate font-medium">{r.counterpartyName}</span> },
            { key: "st", header: "Статус", cell: (r) => <span className="flex flex-wrap items-center gap-1"><Badge color={r.statusColor}>{r.statusName}</Badge>{r.assemblyStatus === "assembled" && <Badge tone="success">собрана</Badge>}{r.assemblyStatus === "assembling" && <Badge tone="warning">собирается</Badge>}</span> },
            { key: "dd", header: "Доставка", cell: (r) => r.deliveryDate ? <span className={r.deliveryDate < d && !["delivered", "paid", "cancelled"].includes(r.statusCode) ? "font-semibold text-danger" : ""}>{fmtDate(r.deliveryDate)}</span> : <span className="text-ink-3">—</span>, className: "whitespace-nowrap" },
            { key: "m", header: "Менеджер", cell: (r) => r.managerName ?? "—", hideMd: true },
            { key: "c", header: "Создана", cell: (r) => fmtDate(r.createdAt), hideMd: true, className: "whitespace-nowrap text-ink-3" },
            { key: "t", header: "Сумма", align: "right", cell: (r) => <span><b>{money(r.total)}</b>{r.paidSum > 0 && <span className="block text-xs text-success">опл. {money(r.paidSum)}</span>}</span> },
          ]}
          mobile={(r) => (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 text-sm font-semibold leading-snug"><span className="text-ink-3">№{r.number}</span> {r.counterpartyName}</p>
                <span className="tnum shrink-0 text-sm font-extrabold">{money(r.total)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                <Badge color={r.statusColor}>{r.statusName}</Badge>
                {r.assemblyStatus === "assembled" && <Badge tone="success">собрана</Badge>}
                {r.deliveryDate && <span className={r.deliveryDate < d && !["delivered", "paid", "cancelled"].includes(r.statusCode) ? "font-semibold text-danger" : ""}>доставка {fmtDate(r.deliveryDate)}</span>}
                <span>· {r.itemsCount} поз.</span>
              </div>
            </div>
          )}
        />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => { const s = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]); s.set("page", String(p)); return `/orders?${s}`; }} />
      </Card>
    </>
  );
}
