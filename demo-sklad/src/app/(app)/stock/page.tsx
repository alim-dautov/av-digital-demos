import Link from "next/link";
import { Boxes, ClipboardCheck, Plus, Search } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { fmtDate, money, num, pct, today } from "@/lib/format";
import { Badge, Card, EmptyState, Input, PageHeader, Stat, buttonClass, cn } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { abc, defaultRange, sameDay, stockReport } from "@/modules/analytics/service";
import { listInventories } from "@/modules/inventory/service";

export const metadata = { title: "Склад" };
type SP = { tab?: string; q?: string; page?: string; date?: string; from?: string; to?: string };

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("stock");
  const sp = await searchParams;
  const db = await getDb();
  const tab = sp.tab ?? "all";
  const href = (o: Partial<SP>) => `/stock?${new URLSearchParams(Object.entries({ ...sp, page: undefined, ...o }).filter(([, v]) => v) as [string, string][])}`;
  const tabs = ["all", "instock", "negative", "low", "sameday", "abc", "inventory"];
  const labels: Record<string, string> = { all: "Все", instock: "В наличии", negative: "Минус", low: "Ниже минимума", sameday: "День в день", abc: "ABC", inventory: "Инвентаризация" };
  return (
    <>
      <PageHeader title="Склад" subtitle="остатки считаются по проведённым документам; минус допускается"
        actions={can(u, "stock", "full") && <Link href="/stock/inventory/new" className={buttonClass("secondary")}><ClipboardCheck className="size-4" />Инвентаризация</Link>} />
      <Tabs active={tab} items={tabs.map((k) => ({ key: k, label: labels[k], href: href({ tab: k === "all" ? undefined : k, q: undefined }) }))} />
      {tab === "sameday" ? <SameDay date={sp.date ?? today()} /> : tab === "abc" ? <Abc from={sp.from} to={sp.to} /> : tab === "inventory" ? <Inventories /> : <Report />}
    </>
  );

  async function Report() {
    const r = await stockReport(db, u, { tab, q: sp.q, page: Number(sp.page) || 1 });
    type R = (typeof r.rows)[number];
    return (
      <>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
          <Stat label="Позиций" value={num(r.total)} />
          {r.value != null && <Stat label="Стоимость остатка (закуп)" value={money(r.value)} />}
        </div>
        <Card className="overflow-hidden">
          <form className="flex gap-2 border-b border-line p-3 sm:p-4" action="/stock">
            {sp.tab && <input type="hidden" name="tab" value={sp.tab} />}
            <div className="flex-1"><Input name="q" defaultValue={sp.q} placeholder="Поиск товара" icon={<Search />} type="search" /></div>
            <button className={buttonClass("secondary")}>Найти</button>
          </form>
          <DataTable<R> rows={r.rows} rowKey={(x) => x.id} rowHref={(x) => `/products/${x.id}`} empty={<EmptyState icon={<Boxes />} title="Ничего не найдено" />}
            columns={[
              { key: "n", header: "Товар", cell: (x) => <span className="block max-w-[360px] truncate font-semibold">{x.name}</span> },
              { key: "f", header: "Папка", cell: (x) => x.folder ?? "—", hideMd: true, className: "text-ink-3" },
              { key: "q", header: "Остаток", align: "right", cell: (x) => <b className={cn(x.qty < 0 ? "text-danger" : x.min_stock > 0 && x.qty < x.min_stock ? "text-warning" : "")}>{num(x.qty)} {x.unit}</b> },
              { key: "m", header: "Мин.", align: "right", cell: (x) => x.min_stock ? num(x.min_stock) : "—", hideMd: true },
              { key: "i", header: "Ожидается", align: "right", cell: (x) => x.incoming ? <span className="text-info">+{num(x.incoming)} · {fmtDate(x.eta!)}</span> : "—", hideMd: true },
              ...(r.value != null ? [{ key: "c", header: "Закуп", align: "right" as const, cell: (x: R) => x.cost ? money(x.cost) : "—", hideMd: true }] : []),
            ]}
            mobile={(x) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{x.name}</p><p className="text-xs text-ink-3">{x.folder ?? "без папки"}{x.incoming ? ` · ожидается +${num(x.incoming)}` : ""}</p></div>
                <b className={cn("tnum shrink-0 text-sm", x.qty < 0 && "text-danger")}>{num(x.qty)} {x.unit}</b>
              </div>
            )} />
          <Pagination page={r.page} pageSize={r.pageSize} total={r.total} href={(p) => `${href({})}&page=${p}`} />
        </Card>
      </>
    );
  }

  async function SameDay({ date }: { date: string }) {
    const rows = await sameDay(db, u, date);
    return (
      <Card className="overflow-hidden">
        <form className="flex items-end gap-2 border-b border-line p-3 sm:p-4" action="/stock">
          <input type="hidden" name="tab" value="sameday" />
          <Input type="date" name="date" defaultValue={date} className="max-w-48" aria-label="Дата" /><button className={buttonClass("secondary")}>Показать</button>
        </form>
        <p className="border-b border-line px-4 py-2 text-xs text-ink-3">Товары, которые приняли и отгрузили в один день — кандидаты на продажу «с колёс» без хранения</p>
        <DataTable rows={rows} rowKey={(x) => x.product_id} rowHref={(x) => `/products/${x.product_id}`} empty={<EmptyState icon={<Boxes />} title="Таких товаров нет" />}
          columns={[{ key: "n", header: "Товар", cell: (x) => x.name }, { key: "r", header: "Принято", align: "right", cell: (x) => `${num(x.received)} ${x.unit}` }, { key: "s", header: "Отгружено", align: "right", cell: (x) => `${num(x.sold)} ${x.unit}` }]}
          mobile={(x) => <div className="flex justify-between gap-2 text-sm"><span className="truncate font-semibold">{x.name}</span><span className="tnum shrink-0">+{num(x.received)} / −{num(x.sold)}</span></div>} />
      </Card>
    );
  }

  async function Abc({ from, to }: { from?: string; to?: string }) {
    const rg = { ...defaultRange(), ...(from ? { from } : {}), ...(to ? { to } : {}) };
    const r = await abc(db, u, rg.from, rg.to);
    const cnt = (g: string) => r.rows.filter((x) => x.group === g).length;
    return (
      <>
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Stat label="A · 80% выручки" value={`${cnt("A")} поз.`} tone="up" /><Stat label="B · 15%" value={`${cnt("B")} поз.`} /><Stat label="C · 5%" value={`${cnt("C")} поз.`} tone="warn" />
        </div>
        <Card className="overflow-hidden">
          <form className="flex flex-wrap items-end gap-2 border-b border-line p-3 sm:p-4" action="/stock">
            <input type="hidden" name="tab" value="abc" />
            <Input type="date" name="from" defaultValue={rg.from} className="max-w-44" aria-label="С" /><Input type="date" name="to" defaultValue={rg.to} className="max-w-44" aria-label="По" />
            <button className={buttonClass("secondary")}>Пересчитать</button>
          </form>
          <DataTable rows={r.rows} rowKey={(x) => x.productId} rowHref={(x) => `/products/${x.productId}`} empty={<EmptyState icon={<Boxes />} title="Нет продаж за период" />}
            columns={[
              { key: "g", header: "Гр.", cell: (x) => <Badge tone={x.group === "A" ? "success" : x.group === "B" ? "info" : "warning"}>{x.group}</Badge> },
              { key: "n", header: "Товар", cell: (x) => <span className="block max-w-[380px] truncate">{x.name}</span> },
              { key: "r", header: "Выручка", align: "right", cell: (x) => money(x.revenue) },
              { key: "s", header: "Доля", align: "right", cell: (x) => pct(x.sharePct), hideMd: true },
              { key: "c", header: "Накоп.", align: "right", cell: (x) => pct(x.cumulativePct), hideMd: true },
            ]}
            mobile={(x) => <div className="flex items-center gap-3 text-sm"><Badge tone={x.group === "A" ? "success" : x.group === "B" ? "info" : "warning"}>{x.group}</Badge><span className="min-w-0 flex-1 truncate">{x.name}</span><b className="tnum">{money(x.revenue)}</b></div>} />
        </Card>
      </>
    );
  }

  async function Inventories() {
    const rows = await listInventories(db, u);
    return (
      <Card className="overflow-hidden">
        <DataTable rows={rows} rowKey={(x) => x.id} rowHref={(x) => `/stock/inventory/${x.id}`}
          empty={<EmptyState icon={<ClipboardCheck />} title="Инвентаризаций не было" action={can(u, "stock", "full") && <Link href="/stock/inventory/new" className={buttonClass("primary")}><Plus className="size-4" />Начать</Link>} />}
          columns={[
            { key: "n", header: "№", cell: (x) => x.number }, { key: "d", header: "Дата", cell: (x) => fmtDate(x.date) },
            { key: "i", header: "Позиций", align: "right", cell: (x) => x.items },
            { key: "dl", header: "Расхождение", align: "right", cell: (x) => <b className={x.delta < 0 ? "text-danger" : x.delta > 0 ? "text-success" : ""}>{x.delta > 0 ? "+" : ""}{num(x.delta)}</b> },
            { key: "s", header: "Статус", cell: (x) => x.posted ? <Badge tone="success">проведена</Badge> : <Badge tone="neutral">черновик</Badge> },
          ]}
          mobile={(x) => <div className="flex justify-between text-sm"><span className="font-semibold">№{x.number} · {fmtDate(x.date)}</span>{x.posted ? <Badge tone="success">проведена</Badge> : <Badge tone="neutral">черновик</Badge>}</div>} />
      </Card>
    );
  }
}
