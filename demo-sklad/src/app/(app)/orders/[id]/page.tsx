import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, FileText, PackageCheck, Truck } from "lucide-react";
import { getDb } from "@/db";
import { requireUser } from "@/lib/auth";
import { can, flag, NotFoundError } from "@/lib/rbac";
import { bp, fmtDate, money, num } from "@/lib/format";
import { ORDER_SOURCES, PAY_METHODS } from "@/lib/labels";
import { Badge, Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { StockDot } from "@/components/pickers";
import { PaymentButton } from "@/components/payment-modal";
import { getOrder, statuses } from "@/modules/orders/service";
import { balanceOf } from "@/modules/counterparties/service";
import { OrderMenu, StatusFlow } from "../_components/order-actions";
import { AssemblyView } from "../_components/assembly";
import { SendDocButton } from "@/components/send-doc";
import { DocVersions } from "@/components/doc-versions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const { q } = await import("@/db/sql");
  const { sql } = await import("drizzle-orm");
  const [r] = await q<{ number: number }>(db, sql`select number from orders where id = ${Number((await params).id) || 0}`);
  return { title: r ? `Заявка №${r.number}` : "Заявка" };
}

const ACCR_STATUS: Record<string, { t: string; tone: "warning" | "success" | "neutral" }> = { pending: { t: "предварительно", tone: "warning" }, confirmed: { t: "подтверждено", tone: "success" }, cancelled: { t: "аннулировано", tone: "neutral" } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mode?: string }> }) {
  const u = await requireUser("orders");
  const db = await getDb();
  const o = await getOrder(db, u, Number((await params).id)).catch((e) => { if (e instanceof NotFoundError) notFound(); throw e; });
  const { mode } = await searchParams;
  const sts = await statuses(db);
  const edit = can(u, "orders", "full");
  const bal = await balanceOf(db, o.counterpartyId);
  const sum = o.items.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  const fullyShipped = o.items.length > 0 && o.items.every((i) => i.shipped >= i.qty);
  const toShip = o.items.some((i) => i.shipped < i.qty);
  const canAssemble = u.isAssembler || edit;
  const assembly = mode === "assembly" && canAssemble;
  const due = o.total - o.paidSum;

  return (
    <>
      <PageHeader back={<BackLink href={assembly ? "/orders?assembly=todo" : "/orders"}>{assembly ? "Сборка" : "Заявки"}</BackLink>}
        title={<span className="flex flex-wrap items-center gap-3">Заявка №{o.number}<Badge color={o.status.color}>{o.status.name}</Badge></span>}
        subtitle={<><Link href={`/counterparties/${o.counterparty.id}`} className="font-semibold text-ink hover:underline">{o.counterparty.name}</Link> · создана {fmtDate(o.createdAt, true)} · {o.authorName}{o.source !== "manual" ? ` · ${ORDER_SOURCES[o.source] ?? o.source}` : ""}</>}
        actions={!assembly && <>
          {canAssemble && o.status.code !== "new" && !o.status.isCancelled && <Link href={`/orders/${o.id}?mode=assembly`} className={buttonClass(o.assemblyStatus === "assembled" ? "secondary" : "primary")}><PackageCheck className="size-4" />{o.assemblyStatus === "assembled" ? "Собрана" : "Собрать"}</Link>}
          {!o.status.isCancelled && o.items.length > 0 && <SendDocButton entity="order" id={o.id} text={`Заказ №${o.number} от Electro Demo на ${money(o.total)}`} phone={o.counterparty.whatsapp ?? o.counterparty.phone} />}
          {edit && <OrderMenu orderId={o.id} number={o.number} deliveryDate={o.deliveryDate} />}
        </>} />

      {assembly ? (
        <div className="mx-auto max-w-2xl">
          {o.comment && <Card className="mb-4 p-4 text-sm"><b>Комментарий:</b> {o.comment}</Card>}
          <AssemblyView orderId={o.id} done={o.assemblyStatus === "assembled"} photos={o.assemblyPhotos}
            items={o.items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, unit: i.unit, qty: i.qty, stock: i.stock, assembled: i.assembled }))} />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <StatusFlow orderId={o.id} edit={edit} willShip={toShip && can(u, "shipments", "full")} current={o.statusId} statuses={sts.map((s) => ({ id: s.id, name: s.name, color: s.color, code: s.code, isCancelled: s.isCancelled }))} />
          {(o.status.code === "delivered" || o.status.code === "paid") && !o.shipments.some((s) => s.kind === "shipment" && s.posted) && (
            <div className="flex items-center gap-3 rounded-2xl border border-warning/40 bg-warning-bg px-4 py-3 text-sm"><AlertTriangle className="size-5 shrink-0 text-warning" />Заявка доставлена, но отгрузка не проведена — товар не списан со склада (нет права на отгрузки или отгрузку удалили).</div>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="min-w-0 overflow-hidden">
              <CardHeader title={`Позиции · ${o.items.length}`} subtitle={o.discountPct ? `скидка ${o.discountPct}%` : undefined} />
              <div className="scroll-thin hidden overflow-x-auto md:block">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-line text-left text-[11px] uppercase text-ink-3"><th className="w-8 py-1.5 pl-4 pr-1">№</th><th className="px-3 py-1.5">Товар</th><th className="px-3 py-1.5 text-right">Кол-во</th><th className="px-3 py-1.5 text-right">Отгружено</th><th className="px-3 py-1.5 text-right">Цена</th><th className="px-3 py-1.5 text-right">Сумма</th></tr></thead>
                  <tbody>
                    {o.items.map((i, n) => (
                      <tr key={i.id} className="border-b border-line last:border-0">
                        <td className="tnum py-1.5 pl-4 pr-1 align-top text-xs text-ink-3">{n + 1}</td>
                        <td className="px-3 py-1.5"><Link href={`/products/${i.productId}`} className="font-semibold leading-tight hover:underline">{i.name}</Link><div className="leading-none"><StockDot stock={i.stock} need={i.qty - i.shipped} unit={i.unit} /></div></td>
                        <td className="tnum px-3 py-1.5 text-right whitespace-nowrap">{num(i.qty)} {i.unit}</td>
                        <td className={`tnum px-3 py-1.5 text-right ${i.shipped >= i.qty ? "text-success" : i.shipped > 0 ? "text-warning" : "text-ink-3"}`}>{num(i.shipped)}</td>
                        <td className="tnum px-3 py-1.5 text-right">{money(i.price)}</td>
                        <td className="tnum px-3 py-1.5 text-right font-semibold">{money(Math.round(i.qty * i.price))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y divide-line md:hidden">
                {o.items.map((i, n) => (
                  <li key={i.id} className="px-4 py-2">
                    <p className="text-[13px] font-semibold leading-tight"><span className="tnum mr-1 font-normal text-ink-3">{n + 1}.</span>{i.name}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[13px]"><span className="tnum text-ink-2">{num(i.qty)} {i.unit} × {money(i.price)}</span><b className="tnum">{money(Math.round(i.qty * i.price))}</b></div>
                    <div className="flex items-center justify-between"><StockDot stock={i.stock} need={i.qty - i.shipped} unit={i.unit} />{i.shipped > 0 && <span className="text-xs text-success">отгружено {num(i.shipped)}</span>}</div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col items-end gap-1 border-t border-line px-4 py-3 text-sm sm:px-5">
                {o.discountPct > 0 && <p className="text-ink-3">Сумма {money(sum)} · скидка −{money(sum - o.total)}</p>}
                <p className="text-lg">Итого: <b className="tnum text-2xl font-extrabold">{money(o.total)}</b></p>
              </div>
            </Card>

            <div className="flex min-w-0 flex-col gap-5">
              <Card className="p-4 sm:p-5">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-ink-3">Доставка</dt><dd className="text-right font-semibold">{o.deliveryDate ? fmtDate(o.deliveryDate) : "—"}</dd>
                  <dt className="text-ink-3">Менеджер</dt><dd className="text-right font-semibold">{o.managerName ?? "—"}</dd>
                  {o.coUserName && <><dt className="text-ink-3">Второй сотрудник</dt><dd className="text-right font-semibold">{o.coUserName} <span className="text-xs font-normal text-ink-3">· бонус пополам</span></dd></>}
                  <dt className="text-ink-3">Оплачено</dt><dd className="tnum text-right font-semibold text-success">{money(o.paidSum)}</dd>
                  <dt className="text-ink-3">Осталось</dt><dd className={`tnum text-right font-extrabold ${due > 0 ? "" : "text-success"}`}>{money(Math.max(0, due))}</dd>
                  <dt className="text-ink-3">Долг клиента</dt><dd className={`tnum text-right font-semibold ${bal.clientDebt > 0 ? "text-danger" : ""}`}>{money(bal.clientDebt)}</dd>
                </dl>
                {o.comment && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">{o.comment}</p>}
                <div className="mt-4 flex flex-col gap-2">
                  {can(u, "shipments", "full") && toShip && !o.status.isCancelled && <Link href={`/shipments/new?order=${o.id}`} className={buttonClass("primary", "md", "w-full")}><Truck className="size-4" />{o.shipments.some((s) => s.kind === "shipment") ? "Дозагрузить отгрузку" : "Создать отгрузку"}</Link>}
                  {can(u, "payments", "full") && due > 0 && !o.status.isCancelled && <PaymentButton direction="in" counterparty={{ id: o.counterparty.id, name: o.counterparty.name }} orderId={o.id} amount={due} variant="accent" />}
                  {fullyShipped && can(u, "shipments", "full") && <Link href={`/shipments/new?order=${o.id}&kind=return`} className={buttonClass("ghost", "md", "w-full")}>Оформить возврат</Link>}
                </div>
              </Card>

              {(o.shipments.length > 0 || o.payments.length > 0) && (
                <Card>
                  <CardHeader title="Документы" />
                  <ul className="divide-y divide-line text-sm">
                    {o.shipments.map((s) => (
                      <li key={`s${s.id}`}><Link href={`/shipments/${s.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5"><FileText className="size-4 text-ink-3" />
                        <span className="flex-1">{s.kind === "return" ? "Возврат" : "Отгрузка"} №{s.number} · {fmtDate(s.date)}{!s.posted && <Badge className="ml-2">черновик</Badge>}</span><b className="tnum">{money(s.total)}</b></Link></li>
                    ))}
                    {o.payments.map((x) => (
                      <li key={`p${x.id}`}><Link href={`/payments/${x.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 sm:px-5"><FileText className="size-4 text-ink-3" />
                        <span className="flex-1">Оплата №{x.number} · {PAY_METHODS[x.method as keyof typeof PAY_METHODS]} · {fmtDate(x.date)}</span><b className="tnum text-success">{money(x.amount)}</b></Link></li>
                    ))}
                  </ul>
                </Card>
              )}

              <DocVersions p={u} entity="order" id={o.id} />

              {flag(u, "seeSalaries") && (
                <Card>
                  <CardHeader title="Начисления по заявке" subtitle="по правилам «кто создал — кому начислить»" />
                  {o.accruals.length === 0 ? <p className="px-5 py-4 text-sm text-ink-3">Нет подходящих правил — начислений нет</p> : (
                    <ul className="divide-y divide-line text-sm">
                      {o.accruals.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                          <span className="min-w-0 flex-1"><span className="block font-semibold">{a.recipientName}</span><span className="text-xs text-ink-3">{a.ruleName} · {bp(a.rateBp)} от {money(a.baseAmount)}{a.kind.startsWith("return") ? " · возврат" : ""}{a.kind.endsWith(":co") ? " · второй сотрудник" : ""}</span></span>
                          <span className="text-right"><b className={`tnum block ${a.amount < 0 ? "text-danger" : ""}`}>{money(a.amount)}</b><Badge tone={ACCR_STATUS[a.status]?.tone}>{ACCR_STATUS[a.status]?.t ?? a.status}</Badge></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}

              {o.assemblyPhotos.length > 0 && (
                <Card className="p-4">
                  <p className="mb-2 text-sm font-bold">Фото сборки</p>
                  <div className="grid grid-cols-3 gap-2">{o.assemblyPhotos.map((f) => <a key={f.id} href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl border border-line">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={`/api/files/${f.id}`} alt="" className="size-full object-cover" loading="lazy" /></a>)}</div>
                </Card>
              )}

              <Card>
                <CardHeader title="История статусов" />
                <ol className="relative flex flex-col gap-3 px-5 py-4">
                  {o.history.map((h) => (
                    <li key={h.id} className="flex gap-3 text-sm">
                      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: h.color }} />
                      <span><b>{h.statusName}</b>{h.comment && <span className="text-ink-2"> — {h.comment}</span>}<span className="block text-xs text-ink-3">{fmtDate(h.createdAt, true)} · {h.userName ?? "система"}</span></span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
