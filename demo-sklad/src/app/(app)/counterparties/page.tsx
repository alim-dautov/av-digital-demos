import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { money } from "@/lib/format";
import { SEGMENT_LABELS, type Segment } from "@/lib/labels";
import { Badge, Card, EmptyState, Input, PageHeader, Select, buttonClass } from "@/components/ui";
import { DataTable, Pagination, Tabs } from "@/components/ui/table";
import { listCounterparties, listTags, salesManagers } from "@/modules/counterparties/service";

export const metadata = { title: "Контрагенты" };

type SP = { q?: string; tab?: string; segment?: string; tag?: string; manager?: string; page?: string };

export default async function CounterpartiesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser("counterparties");
  const sp = await searchParams;
  const db = await getDb();
  const tab = sp.tab ?? "clients";
  const kind = tab === "suppliers" ? "supplier" : tab === "all" ? undefined : "client";
  const [list, tags, managers] = await Promise.all([
    listCounterparties(db, u, { q: sp.q, kind, segment: sp.segment, tag: sp.tag, managerId: sp.manager ? Number(sp.manager) : undefined, debtors: tab === "debtors", page: Number(sp.page) || 1, pageSize: 50 }),
    listTags(db), salesManagers(db),
  ]);
  const href = (o: Partial<SP>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...o })) if (v) s.set(k, String(v));
    return `/counterparties?${s}`;
  };
  type R = (typeof list.rows)[number];
  const supplier = tab === "suppliers";
  return (
    <>
      <PageHeader title="Контрагенты" subtitle="клиенты, поставщики, долги и сегменты"
        actions={can(u, "counterparties", "full") && <Link href={`/counterparties/new${supplier ? "?kind=supplier" : ""}`} className={buttonClass("primary")}><Plus className="size-4" />Добавить</Link>} />
      <Tabs active={tab} items={[
        { key: "clients", label: "Клиенты", href: href({ tab: "clients" }) },
        { key: "debtors", label: "Должники", href: href({ tab: "debtors" }) },
        { key: "suppliers", label: "Поставщики", href: href({ tab: "suppliers" }) },
        { key: "all", label: "Все", href: href({ tab: "all" }) },
      ]} />
      <Card className="overflow-hidden">
        <form className="grid gap-2 border-b border-line p-3 sm:grid-cols-[1fr_160px_160px_160px_auto] sm:p-4" action="/counterparties">
          <input type="hidden" name="tab" value={tab} />
          <Input name="q" defaultValue={sp.q} placeholder="Название или телефон" icon={<Search />} type="search" />
          <Select name="segment" defaultValue={sp.segment ?? ""} aria-label="Сегмент"><option value="">Все сегменты</option>{Object.entries(SEGMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select name="tag" defaultValue={sp.tag ?? ""} aria-label="Тег"><option value="">Все теги</option>{tags.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}</Select>
          <Select name="manager" defaultValue={sp.manager ?? ""} aria-label="Менеджер"><option value="">Все менеджеры</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          <button className={buttonClass("secondary")}>Найти</button>
        </form>
        <DataTable<R>
          rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => `/counterparties/${r.id}`}
          empty={<EmptyState icon={<Users />} title="Никого не нашли" text="Измените фильтры или добавьте контрагента" />}
          columns={[
            { key: "name", header: "Название", cell: (r) => <span className="inline-flex items-center gap-2">{r.name}{r.isService && <Badge tone="info">служебный</Badge>}</span> },
            { key: "seg", header: "Сегмент", cell: (r) => <Badge tone="navy">{SEGMENT_LABELS[r.segment as Segment] ?? r.segment}</Badge>, hideMd: true },
            { key: "phone", header: "Телефон", cell: (r) => r.phone ?? "—", className: "whitespace-nowrap" },
            { key: "mgr", header: "Менеджер", cell: (r) => r.managerName ?? "—", hideMd: true },
            { key: "tags", header: "Теги", cell: (r) => <span className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</span>, hideMd: true },
            supplier
              ? { key: "our", header: "Мы должны", align: "right", cell: (r) => r.ourDebt > 0 ? <b className="text-warning">{money(r.ourDebt)}</b> : <span className="text-ink-3">—</span> }
              : { key: "debt", header: "Долг", align: "right", cell: (r) => r.clientDebt > 0 ? <b className={r.debtLimit > 0 && r.clientDebt > r.debtLimit ? "text-danger" : ""}>{money(r.clientDebt)}</b> : r.clientDebt < 0 ? <span className="text-success">аванс {money(-r.clientDebt)}</span> : <span className="text-ink-3">—</span> },
          ]}
          mobile={(r) => (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-ink-3">{[SEGMENT_LABELS[r.segment as Segment], r.phone, r.managerName].filter(Boolean).join(" · ")}</p>
              </div>
              {supplier ? r.ourDebt > 0 && <span className="tnum text-sm font-bold text-warning">{money(r.ourDebt)}</span>
                : r.clientDebt > 0 && <span className={`tnum text-sm font-bold ${r.debtLimit > 0 && r.clientDebt > r.debtLimit ? "text-danger" : ""}`}>{money(r.clientDebt)}</span>}
            </div>
          )}
        />
        <Pagination page={list.page} pageSize={list.pageSize} total={list.total} href={(p) => `${href({})}&page=${p}`} />
      </Card>
    </>
  );
}
