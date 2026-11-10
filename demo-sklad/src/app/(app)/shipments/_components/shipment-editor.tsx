"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AlertTriangle, Truck, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardHeader, Checkbox, Field, Input, MoneyInput, Textarea } from "@/components/ui";
import { CpPicker, ProductPicker, StockDot, backToSearch, focusQty, type CpOption } from "@/components/pickers";
import { useRun } from "@/components/use-run";
import { money, num, today } from "@/lib/format";
import { checkDebtAction, createShipmentAction } from "@/modules/shipments/actions";

type Line = { productId: number; name: string; unit: string; qty: number; price: number; max?: number; ordered?: number; shipped?: number; stock?: number };
type Debt = { exceeded: false } | { exceeded: true; mode: string; debt: number; after: number; limit: number };

export function ShipmentEditor({ kind, orderId, orderNumber, counterparty, lines, priceTypeId, canOverride }: {
  kind: "shipment" | "return"; orderId: number | null; orderNumber?: number; counterparty: CpOption | null; lines: Line[]; priceTypeId: number | null; canOverride: boolean;
}) {
  const router = useRouter();
  const [cp, setCp] = useState(counterparty);
  const [items, setItems] = useState(lines);
  const [date, setDate] = useState(today());
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState(false);
  const [debt, setDebt] = useState<Debt>({ exceeded: false });
  const { pending, run } = useRun();
  const active = items.filter((i) => i.qty > 0);
  const total = active.reduce((s, i) => s + Math.round(i.qty * i.price), 0);
  const isReturn = kind === "return";

  useEffect(() => {
    if (isReturn || !cp || total <= 0) { setDebt({ exceeded: false }); return; }
    const t = setTimeout(async () => { const r = await checkDebtAction({ counterpartyId: cp.id, amount: total }); if (r.ok) setDebt(r.data as Debt); }, 400);
    return () => clearTimeout(t);
  }, [cp, total, isReturn]);

  const upd = (pid: number, patch: Partial<Line>) => setItems(items.map((i) => (i.productId === pid ? { ...i, ...patch } : i)));
  const blocked = debt.exceeded && debt.mode === "block" && !override;
  const submit = () => {
    if (!cp) { toast.error("Выберите контрагента"); return; }
    run(() => createShipmentAction({ kind, orderId, counterpartyId: cp.id, date, comment, overrideDebtLimit: override, items: active.map((i) => ({ productId: i.productId, qty: i.qty, price: i.price })) }),
      { success: isReturn ? "Возврат проведён" : "Отгрузка проведена, остатки списаны", onOk: (id) => router.push(`/shipments/${id}`) });
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card>
          <CardHeader title={isReturn ? "Возврат от клиента" : "Отгрузка клиенту"} subtitle={orderNumber ? `по заявке №${orderNumber}` : "без заявки"} />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div className="sm:col-span-2">{orderId ? <CpPicker value={cp} onChange={() => {}} /> : <CpPicker value={cp} onChange={setCp} kind="client" autoFocus />}</div>
            <Field label="Дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
        </Card>
        <Card>
          <CardHeader title={`Позиции · ${active.length}`} subtitle={isReturn ? "укажите, сколько вернули (не больше отгруженного)" : orderId ? "неотгруженный остаток по заявке" : undefined} />
          {!orderId && <div className="p-4 pb-2 sm:px-5"><ProductPicker inputId="shipment-product-search" cpId={cp?.id} priceTypeId={priceTypeId} onPick={(p) => { setItems((x) => x.some((i) => i.productId === p.id) ? x : [...x, { productId: p.id, name: p.name, unit: p.unit, qty: 1, price: priceTypeId ? p.prices[priceTypeId] ?? 0 : 0, stock: p.stock }]); focusQty(p.id); }} /></div>}
          <ul className="divide-y divide-line">
            {items.map((i) => (
              <li key={i.productId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_120px_130px_100px_auto] sm:px-5">
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="text-sm font-semibold leading-snug">{i.name}</p>
                  <p className="text-xs text-ink-3">{i.ordered != null && <>заказано {num(i.ordered)} · отгружено {num(i.shipped ?? 0)}</>}</p>
                  {!isReturn && i.stock != null && <StockDot stock={i.stock} need={i.qty} unit={i.unit} />}
                </div>
                <div className="flex items-center gap-1.5"><Input type="number" inputMode="decimal" min={0} max={i.max} step="any" value={i.qty} className="tnum text-right" aria-label="Количество" data-qty-for={i.productId} onKeyDown={backToSearch("shipment-product-search")}
                  onChange={(e) => { const v = Number(e.target.value) || 0; upd(i.productId, { qty: i.max != null ? Math.min(i.max, v) : v }); }} /><span className="w-8 text-xs text-ink-3">{i.unit}</span></div>
                <MoneyInput value={i.price} onChange={(v) => upd(i.productId, { price: v })} aria-label="Цена" className="text-right" />
                <p className="tnum text-right text-sm font-bold">{money(Math.round(i.qty * i.price))}</p>
                {!orderId ? <Button variant="ghost" size="icon-sm" aria-label="Убрать" onClick={() => setItems(items.filter((x) => x.productId !== i.productId))}><X className="size-4" /></Button> : <span />}
              </li>
            ))}
          </ul>
          {!items.length && <p className="px-5 pb-5 text-sm text-ink-3">Нет позиций</p>}
        </Card>
      </div>
      <Card className="flex flex-col gap-4 p-4 sm:p-5 lg:sticky lg:top-20 lg:self-start">
        <div className="flex items-baseline justify-between"><span className="font-bold">{isReturn ? "К возврату" : "Сумма"}</span><span className="tnum text-[26px] font-extrabold">{money(total)}</span></div>
        {debt.exceeded && (
          <div className={`flex flex-col gap-2 rounded-xl p-3 text-sm ${debt.mode === "block" ? "bg-danger-bg text-danger" : "bg-warning-bg text-[#b45309] dark:text-warning"}`}>
            <p className="flex gap-2 font-semibold"><AlertTriangle className="size-4 shrink-0" />Лимит долга {money(debt.limit)} будет превышен: станет {money(debt.after)}</p>
            {debt.mode === "block" && (canOverride ? <Checkbox checked={override} onChange={setOverride} label="Провести под мою ответственность" /> : <p>Отгрузка заблокирована. Нужна оплата или разрешение руководителя.</p>)}
          </div>
        )}
        <Field label="Комментарий"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-16" /></Field>
        <Button variant="accent" size="lg" icon={isReturn ? <Undo2 className="size-4" /> : <Truck className="size-4" />} loading={pending} disabled={!active.length || !cp || blocked} onClick={submit}>
          {isReturn ? "Провести возврат" : "Провести отгрузку"}
        </Button>
        <p className="text-xs text-ink-3">{isReturn ? "Товар вернётся на склад, долг клиента уменьшится, начисления по заявке скорректируются." : "Остатки спишутся, себестоимость зафиксируется по последней закупке."}</p>
      </Card>
    </div>
  );
}
