import Link from "next/link";
import { headers } from "next/headers";
import { AlertTriangle, ChevronDown, FileDown, Phone, Search } from "lucide-react";
import { getDb } from "@/db";
import { fmtDate, money, num, plural } from "@/lib/format";
import { PAY_METHODS } from "@/lib/labels";
import { rateLimit } from "@/lib/rate-limit";
import { Badge, Card, CardHeader, EmptyState, buttonClass } from "@/components/ui";
import { Tabs } from "@/components/ui/table";
import { portalCatalog, portalData } from "@/modules/counterparties/portal";
import { getSetting } from "@/modules/settings/store";

export const metadata = { title: "Личный кабинет", referrer: "no-referrer" };

type Data = NonNullable<Awaited<ReturnType<typeof portalData>>>;
type Items = { name: string; unit: string; qty: number; price: number }[];

/** Личный кабинет контрагента по постоянной ссылке: заявки, накладные, оплаты, долг, акт сверки */
export default async function ClientPortal({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ tab?: string; from?: string; to?: string; q?: string; folder?: string; stock?: string; page?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`portal:${ip}`, 60, 60_000).ok) return <Card className="p-10"><EmptyState title="Слишком много запросов" text="Подождите минуту и обновите страницу" /></Card>;
  const db = await getDb();
  const d = await portalData(db, token, { from: sp.from, to: sp.to });
  if (!d) return <Card className="p-10"><EmptyState title="Ссылка недействительна" text="Ссылка отозвана или повреждена — запросите новую у менеджера" /></Card>;
  const company = await getSetting(db, "company");
  const base = `/p/client/${token}`;
  const tab = sp.tab ?? "overview";
  const t = encodeURIComponent(token);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm font-semibold text-ink-3">Личный кабинет · {company.name || company.legalName}</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">{d.cp.name}</h1>
        {(d.cp.bin || d.cp.address) && <p className="mt-1 text-sm text-ink-2">{[d.cp.bin && `БИН/ИИН ${d.cp.bin}`, d.cp.address].filter(Boolean).join(" · ")}</p>}
      </div>

      <BalanceCards d={d} />

      <Tabs active={tab} items={[
        { key: "overview", label: "Обзор", href: base },
        ...(d.isClient ? [
          { key: "catalog", label: "Наличие и цены", href: `${base}?tab=catalog` },
          { key: "orders", label: "Заявки", href: `${base}?tab=orders`, count: d.orders.length },
          { key: "shipments", label: "Накладные", href: `${base}?tab=shipments`, count: d.shipments.length },
        ] : []),
        ...(d.isSupplier ? [{ key: "receipts", label: "Поставки", href: `${base}?tab=receipts`, count: d.receipts.length }] : []),
        { key: "payments", label: "Оплаты", href: `${base}?tab=payments`, count: d.payments.length },
        { key: "recon", label: "Акт сверки", href: `${base}?tab=recon` },
      ]} />

      {tab === "overview" && (
        <div className="flex flex-col gap-5">
          {d.isClient && <OrdersList d={d} limit={5} more={`${base}?tab=orders`} />}
          {d.isClient && <ShipmentsList d={d} t={t} limit={5} more={`${base}?tab=shipments`} />}
          <PaymentsList d={d} limit={5} more={`${base}?tab=payments`} />
        </div>
      )}
      {tab === "catalog" && d.isClient && <Catalog cpId={d.cp.id} base={base} sp={sp} />}
      {tab === "orders" && <OrdersList d={d} />}
      {tab === "shipments" && <ShipmentsList d={d} t={t} />}
      {tab === "receipts" && <ReceiptsList d={d} />}
      {tab === "payments" && <PaymentsList d={d} />}
      {tab === "recon" && <Recon d={d} base={base} t={t} />}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="text-sm">
          {d.manager ? <>Ваш менеджер: <b>{d.manager.name}</b></> : <>Вопросы по расчётам: <b>{company.name}</b></>}
          <p className="text-xs text-ink-3">Данные обновляются автоматически при каждом открытии страницы</p>
        </div>
        {(d.manager?.phone || company.phone) && <a href={`tel:${d.manager?.phone || company.phone}`} className={buttonClass("secondary")}><Phone className="size-4" />{d.manager?.phone || company.phone}</a>}
      </Card>
    </div>
  );
}

function BalanceCards({ d }: { d: Data }) {
  const debt = d.balance.clientDebt;
  const over = d.cp.debtLimit > 0 && debt > d.cp.debtLimit;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {d.isClient && (
          <Card className="col-span-2 p-4 sm:col-span-1">
            <p className="text-xs font-semibold text-ink-3">{debt < 0 ? "Ваш аванс" : "К оплате"}</p>
            <p className={`tnum mt-1 text-2xl font-extrabold ${debt > 0 ? (over || d.balance.overdueDays > 14 ? "text-danger" : "") : "text-success"}`}>{money(Math.abs(debt))}</p>
            {debt === 0 && <p className="text-xs text-success">Задолженности нет</p>}
            {debt > 0 && d.balance.overdueDays > 0 && <p className="text-xs text-ink-3">старейший долг — {d.balance.overdueDays} {plural(d.balance.overdueDays, "день", "дня", "дней")}</p>}
          </Card>
        )}
        {d.isClient && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Отгружено всего</p><p className="tnum mt-1 text-xl font-extrabold">{money(d.totals.shipped - d.totals.returned)}</p>{d.totals.lastShip && <p className="text-xs text-ink-3">последняя {fmtDate(d.totals.lastShip)}</p>}</Card>}
        {d.isClient && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Оплачено всего</p><p className="tnum mt-1 text-xl font-extrabold">{money(d.totals.paid)}</p>{d.totals.lastPay && <p className="text-xs text-ink-3">последняя {fmtDate(d.totals.lastPay)}</p>}</Card>}
        {d.isClient && d.cp.debtLimit > 0 && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Кредитный лимит</p><p className="tnum mt-1 text-xl font-extrabold">{money(d.cp.debtLimit)}</p><p className="text-xs text-ink-3">{over ? "превышен" : `доступно ${money(d.cp.debtLimit - Math.max(0, debt))}`}</p></Card>}
        {d.isSupplier && <Card className="p-4"><p className="text-xs font-semibold text-ink-3">Наш долг вам</p><p className="tnum mt-1 text-xl font-extrabold">{money(d.balance.ourDebt)}</p></Card>}
      </div>
      {over && <div className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger"><AlertTriangle className="size-5 shrink-0" />Задолженность превышает кредитный лимит на {money(debt - d.cp.debtLimit)}</div>}
    </>
  );
}

function More({ href, shown, total }: { href?: string; shown: number; total: number }) {
  if (!href || total <= shown) return null;
  return <Link href={href} className="block border-t border-line px-4 py-3 text-center text-sm font-semibold text-ink-2 hover:bg-surface-2 sm:px-5">Показать все ({total})</Link>;
}

function ItemsTable({ items, total }: { items: Items; total: number }) {
  if (!items.length) return <p className="px-4 pb-3 text-sm text-ink-3 sm:px-5">Позиции не указаны</p>;
  return (
    <div className="scroll-thin overflow-x-auto px-4 pb-3 sm:px-5">
      <table className="w-full min-w-[440px] text-sm">
        <thead><tr className="text-left text-xs text-ink-3"><th className="py-1.5 font-semibold">Товар</th><th className="py-1.5 text-right font-semibold">Кол-во</th><th className="py-1.5 text-right font-semibold">Цена</th><th className="py-1.5 text-right font-semibold">Сумма</th></tr></thead>
        <tbody>
          {items.map((i, k) => (
            <tr key={k} className="border-t border-line">
              <td className="py-1.5 pr-3">{i.name}</td>
              <td className="tnum py-1.5 text-right whitespace-nowrap">{num(i.qty)} {i.unit}</td>
              <td className="tnum py-1.5 text-right whitespace-nowrap">{money(i.price)}</td>
              <td className="tnum py-1.5 text-right whitespace-nowrap">{money(Math.round(i.qty * i.price))}</td>
            </tr>
          ))}
          <tr className="border-t border-line font-bold"><td className="py-1.5" colSpan={3}>Итого</td><td className="tnum py-1.5 text-right">{money(total)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}

function OrdersList({ d, limit, more }: { d: Data; limit?: number; more?: string }) {
  const rows = limit ? d.orders.slice(0, limit) : d.orders;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Заявки" subtitle={limit ? "последние" : `последние ${d.orders.length}`} />
      {!rows.length ? <EmptyState title="Заявок пока нет" /> : (
        <ul className="divide-y divide-line">
          {rows.map((o) => {
            const debt = o.shipped - o.paid;
            return (
              <li key={o.id}>
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">Заявка №{o.number}</span>
                      <span className="text-xs text-ink-3">от {fmtDate(o.date)}{o.delivery_date && ` · доставка ${fmtDate(o.delivery_date)}`}{!o.is_cancelled && o.paid > 0 && ` · оплачено ${money(o.paid)}`}{!o.is_cancelled && debt > 0 && o.paid > 0 && ` · остаток ${money(debt)}`}</span>
                    </span>
                    <Badge color={o.color}>{o.status}</Badge>
                    <span className="tnum hidden w-28 text-right text-sm font-bold sm:block">{money(o.total)}</span>
                    <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="tnum px-4 pb-1 text-sm font-bold sm:hidden">{money(o.total)}</p>
                  <ItemsTable items={o.items} total={o.total} />
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <More href={more} shown={rows.length} total={d.orders.length} />
    </Card>
  );
}

function ShipmentsList({ d, t, limit, more }: { d: Data; t: string; limit?: number; more?: string }) {
  const rows = limit ? d.shipments.slice(0, limit) : d.shipments;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Накладные" subtitle="отгрузки и возвраты" />
      {!rows.length ? <EmptyState title="Отгрузок пока нет" /> : (
        <ul className="divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id}>
              <details className="group">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{s.kind === "return" ? "Возврат" : "Накладная"} №{s.number}</span>
                    <span className="text-xs text-ink-3">{fmtDate(s.date)}{s.order_number && ` · по заявке №${s.order_number}`}</span>
                  </span>
                  <span className={`tnum w-28 text-right text-sm font-bold ${s.kind === "return" ? "text-success" : ""}`}>{s.kind === "return" ? "−" : ""}{money(s.total)}</span>
                  <ChevronDown className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
                <ItemsTable items={s.items} total={s.total} />
                <div className="px-4 pb-4 sm:px-5">
                  <a href={`/api/pdf/shipment/${s.id}?portal=${t}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}><FileDown className="size-4" />Скачать PDF</a>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
      <More href={more} shown={rows.length} total={d.shipments.length} />
    </Card>
  );
}

function ReceiptsList({ d }: { d: Data }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Поставки" subtitle="принятые нами товары" />
      {!d.receipts.length ? <EmptyState title="Поставок пока нет" /> : (
        <ul className="divide-y divide-line">
          {d.receipts.map((r) => (
            <li key={r.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Приёмка №{r.number}</span><span className="text-xs text-ink-3">{fmtDate(r.date)}</span></span>
              <span className="tnum w-28 text-right text-sm font-bold">{money(r.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PaymentsList({ d, limit, more }: { d: Data; limit?: number; more?: string }) {
  const rows = limit ? d.payments.slice(0, limit) : d.payments;
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Оплаты" />
      {!rows.length ? <EmptyState title="Оплат пока нет" /> : (
        <ul className="divide-y divide-line">
          {rows.map((x) => (
            <li key={x.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{x.direction === "out" ? "Оплата вам" : "Оплата"} №{x.number}</span>
                <span className="text-xs text-ink-3">{fmtDate(x.date)} · {PAY_METHODS[x.method as keyof typeof PAY_METHODS] ?? x.method}{x.order_number && ` · заявка №${x.order_number}`}{x.shipment_number && ` · накладная №${x.shipment_number}`}</span>
              </span>
              <span className="tnum w-28 text-right text-sm font-bold text-success">{money(x.amount)}</span>
            </li>
          ))}
        </ul>
      )}
      <More href={more} shown={rows.length} total={d.payments.length} />
    </Card>
  );
}

function Recon({ d, base, t }: { d: Data; base: string; t: string }) {
  const r = d.recon;
  const fmtBal = (v: number) => (v === 0 ? "0 ₸" : r.side === "client" ? (v > 0 ? `ваш долг ${money(v)}` : `ваш аванс ${money(-v)}`) : v < 0 ? `наш долг ${money(-v)}` : `переплата ${money(v)}`);
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Акт сверки · ${fmtDate(r.from)} – ${fmtDate(r.to)}`} />
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <form action={base} method="get" className="grid grid-cols-2 gap-2 sm:grid-cols-[150px_150px_auto]">
          <input type="hidden" name="tab" value="recon" />
          <input type="date" name="from" defaultValue={r.from} aria-label="С" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
          <input type="date" name="to" defaultValue={r.to} aria-label="По" className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" />
          <button type="submit" className={buttonClass("secondary", "md", "col-span-2 sm:col-span-1")}>Показать</button>
        </form>
        <a href={`/api/pdf/recon/${d.cp.id}?portal=${t}&from=${r.from}&to=${r.to}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}><FileDown className="size-4" />Скачать PDF</a>
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-y border-line bg-surface-2 text-left text-xs uppercase text-ink-3"><th className="px-4 py-2.5">Дата</th><th className="px-4 py-2.5">Документ</th><th className="px-4 py-2.5 text-right">Дебет</th><th className="px-4 py-2.5 text-right">Кредит</th></tr></thead>
          <tbody>
            <tr className="border-b border-line font-semibold"><td className="px-4 py-2.5" colSpan={2}>Сальдо на {fmtDate(r.from)}</td><td className="tnum px-4 py-2.5 text-right" colSpan={2}>{fmtBal(r.opening)}</td></tr>
            {r.rows.map((x, i) => (
              <tr key={i} className="border-b border-line">
                <td className="tnum px-4 py-2.5 whitespace-nowrap">{fmtDate(x.date)}</td>
                <td className="px-4 py-2.5">{x.doc}</td>
                <td className="tnum px-4 py-2.5 text-right">{x.debit ? money(x.debit) : ""}</td>
                <td className="tnum px-4 py-2.5 text-right">{x.credit ? money(x.credit) : ""}</td>
              </tr>
            ))}
            {!r.rows.length && <tr className="border-b border-line"><td className="px-4 py-4 text-center text-ink-3" colSpan={4}>За период движений нет</td></tr>}
            <tr className="border-b border-line font-semibold"><td className="px-4 py-2.5" colSpan={2}>Обороты за период</td><td className="tnum px-4 py-2.5 text-right">{money(r.debit)}</td><td className="tnum px-4 py-2.5 text-right">{money(r.credit)}</td></tr>
            <tr className="bg-yellow-50 font-extrabold dark:bg-white/5"><td className="px-4 py-3" colSpan={2}>Сальдо на {fmtDate(r.to)}</td><td className="tnum px-4 py-3 text-right" colSpan={2}>{fmtBal(r.closing)}</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

async function Catalog({ cpId, base, sp }: { cpId: number; base: string; sp: { q?: string; folder?: string; stock?: string; page?: string } }) {
  const db = await getDb();
  const inStock = sp.stock === "1";
  const c = await portalCatalog(db, cpId, { q: sp.q?.trim(), folder: Number(sp.folder) || undefined, inStock, page: Number(sp.page) || 1 });
  if (!c) return <Card className="p-10"><EmptyState title="Прайс недоступен" text="Уточните цены у менеджера" /></Card>;
  const pages = Math.max(1, Math.ceil(c.total / c.pageSize));
  const href = (page: number) => `${base}?${new URLSearchParams({ tab: "catalog", ...(sp.q ? { q: sp.q } : {}), ...(sp.folder ? { folder: sp.folder } : {}), ...(inStock ? { stock: "1" } : {}), page: String(page) })}`;
  const field = "h-10 rounded-xl border border-line bg-surface px-3 text-sm";
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Наличие и цены" subtitle={`ваши цены · ${c.priceType} · остатки на текущий момент`} />
      <form action={base} method="get" className="grid gap-2 p-4 sm:grid-cols-[1fr_220px_auto_auto] sm:items-center sm:p-5">
        <input type="hidden" name="tab" value="catalog" />
        <label className="relative"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input type="search" name="q" defaultValue={sp.q} placeholder="Название или артикул" aria-label="Поиск" className={`${field} w-full pl-9`} /></label>
        <select name="folder" defaultValue={sp.folder ?? ""} aria-label="Раздел" className={field}>
          <option value="">Все разделы</option>
          {c.folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <label className="flex h-10 items-center gap-2 px-1 text-sm"><input type="checkbox" name="stock" value="1" defaultChecked={inStock} className="size-4 accent-[var(--navy)]" />только в наличии</label>
        <button type="submit" className={buttonClass("primary")}>Найти</button>
      </form>
      {!c.rows.length ? <EmptyState title="Ничего не найдено" text="Измените запрос или раздел" /> : (
        <ul className="divide-y divide-line border-t border-line">
          {c.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-ink-3">{[r.sku && `арт. ${r.sku}`, r.folder].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="w-28 shrink-0 text-right">
                {r.stock > 0
                  ? <Badge tone="success">{num(r.stock)} {r.unit}</Badge>
                  : r.incoming > 0 ? <Badge tone="info">ожид. {r.eta ? fmtDate(r.eta) : ""}</Badge> : <Badge>нет</Badge>}
              </div>
              <b className="tnum w-24 shrink-0 text-right text-sm sm:w-28">{money(r.price)}<span className="block text-[11px] font-normal text-ink-3">за {r.unit}</span></b>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm sm:px-5">
        <span className="text-ink-3">Найдено: {c.total}</span>
        {pages > 1 && <span className="flex items-center gap-2">
          {c.page > 1 && <Link href={href(c.page - 1)} className={buttonClass("ghost", "sm")}>← Назад</Link>}
          <span className="tnum text-ink-3">{c.page} / {pages}</span>
          {c.page < pages && <Link href={href(c.page + 1)} className={buttonClass("ghost", "sm")}>Дальше →</Link>}
        </span>}
      </div>
    </Card>
  );
}
