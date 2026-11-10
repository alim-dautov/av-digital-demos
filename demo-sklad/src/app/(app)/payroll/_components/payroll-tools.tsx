"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Banknote, Gift, Lock, LogIn, LogOut, Trash2, Unlock } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { money, today } from "@/lib/format";
import {
  addAdjustmentAction, addAdvanceAction, addPayoutAction, checkInOutAction, closePeriodAction, deleteAdjustmentAction, deletePayMoneyAction, penaltyInfoAction, reopenPeriodAction,
} from "@/modules/payroll/actions";

type Acc = { id: number; name: string };

export function PeriodSelect({ keys, labels, value }: { keys: string[]; labels: Record<string, string>; value: string }) {
  const router = useRouter();
  return (
    <Select value={value} onChange={(e) => { const u = new URL(location.href); u.searchParams.set("period", e.target.value); router.push(u.pathname + u.search); }} aria-label="Период" className="w-auto min-w-52">
      {keys.map((k) => <option key={k} value={k}>{labels[k] ?? k}</option>)}
    </Select>
  );
}

export function PayButton({ kind, userId, name, periodKey, amount, accounts }: { kind: "advance" | "payout"; userId: number; name: string; periodKey: string; amount: number; accounts: Acc[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ amount, accountId: accounts[0]?.id ?? 0, date: today(), comment: "" });
  const { pending, run } = useRun();
  const act = kind === "advance" ? addAdvanceAction : addPayoutAction;
  return (
    <>
      <Button size="sm" variant={kind === "payout" ? "accent" : "secondary"} icon={<Banknote className="size-4" />} onClick={() => { setF((x) => ({ ...x, amount: kind === "payout" ? Math.max(0, amount) : x.amount })); setOpen(true); }}>{kind === "advance" ? "Аванс" : "Выплатить"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title={`${kind === "advance" ? "Аванс" : "Выплата"}: ${name}`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button variant="accent" loading={pending} disabled={f.amount <= 0 || !f.accountId}
          onClick={() => run(() => act({ userId, periodKey, ...f }), { success: kind === "advance" ? "Аванс выдан, расход записан в кассу" : "Выплата проведена", onOk: () => setOpen(false) })}>Провести</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Сумма"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Касса"><Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: Number(e.target.value) })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="min-h-14" /></Field>
        </div>
      </Modal>
    </>
  );
}

export function AdjustButton({ people }: { people: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ userId: people[0]?.id ?? 0, date: today(), type: "bonus" as "bonus" | "penalty" | "expense" | "weekend" | "overtime", amount: 0, hours: null as number | null, comment: "" });
  const [pen, setPen] = useState<{ count: number; sum: number; suggested: number | null } | null>(null);
  const { pending, run } = useRun();
  // штраф нарастающий: сколько штрафов уже за месяц и какая сумма следующего
  useEffect(() => {
    if (!open || f.type !== "penalty" || !f.userId || !/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { setPen(null); return; }
    let live = true;
    penaltyInfoAction({ userId: f.userId, date: f.date }).then((r) => {
      if (!live || !r.ok) return;
      setPen(r.data);
      if (r.data.suggested != null) setF((x) => ({ ...x, amount: r.data.suggested! }));
    });
    return () => { live = false; };
  }, [open, f.type, f.userId, f.date]);
  return (
    <>
      <Button variant="secondary" icon={<Gift className="size-4" />} onClick={() => setOpen(true)}>Бонус / штраф / расход</Button>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Корректировка"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button variant="accent" loading={pending} disabled={!f.comment.trim() || (f.type !== "overtime" && f.amount <= 0)}
          onClick={() => run(() => addAdjustmentAction(f), { success: "Записано", onOk: () => setOpen(false) })}>Сохранить</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Сотрудник"><Select value={f.userId} onChange={(e) => setF({ ...f, userId: Number(e.target.value) })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Тип"><Select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as "bonus" })}><option value="bonus">Бонус</option><option value="penalty">Штраф</option><option value="expense">Расход (удержание)</option><option value="weekend">Выход в выходной</option><option value="overtime">Сверхурочные</option></Select></Field>
            <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          </div>
          {f.type === "overtime"
            ? <Field label="Часы" hint="сумма по ставке из схемы, если не указана"><Input type="number" min={0} step="0.25" value={f.hours ?? ""} onChange={(e) => setF({ ...f, hours: e.target.value ? Number(e.target.value) : null })} /></Field>
            : null}
          <Field label="Сумма" hint={f.type === "weekend" ? "0 — по ставке из схемы" : f.type === "expense" ? "вычитается из зарплаты: взял товар, деньги из кассы, ГСМ и т.п." : undefined}><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
          {f.type === "penalty" && pen && (
            <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-ink-2">
              Штрафов за месяц: <b>{pen.count}</b> на <b>{money(pen.sum)}</b>. Этот — {pen.count + 1}-й, итого будет <b>{money(pen.sum + f.amount)}</b>.
              {pen.suggested == null && <span className="block text-ink-3">Сумму нарастающего штрафа можно задать в «Настройки → Параметры → Зарплата».</span>}
            </p>
          )}
          <Field label="Причина" required><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="min-h-14" /></Field>
        </div>
      </Modal>
    </>
  );
}

export function PeriodLock({ periodKey, closed }: { periodKey: string; closed: boolean }) {
  const { pending, run } = useRun();
  return closed
    ? <Button variant="ghost" icon={<Unlock className="size-4" />} loading={pending} onClick={() => { const reason = prompt("Причина открытия периода для правки?"); if (reason) run(() => reopenPeriodAction({ key: periodKey, reason }), { success: "Период открыт" }); }}>Открыть период</Button>
    : <Button variant="primary" icon={<Lock className="size-4" />} loading={pending} onClick={() => confirm("Закрыть период? Расчёт зафиксируется, правки станут недоступны.") && run(() => closePeriodAction({ key: periodKey }), { success: "Период закрыт" })}>Закрыть период</Button>;
}

export function DeleteMoney({ kind, id }: { kind: "advance" | "payout" | "adjustment"; id: number }) {
  const { pending, run } = useRun();
  return <Button variant="ghost" size="icon-sm" aria-label="Удалить" loading={pending}
    onClick={() => confirm("Удалить запись?") && run(() => (kind === "adjustment" ? deleteAdjustmentAction({ id }) : deletePayMoneyAction({ kind, id })), { success: "Удалено" })}><Trash2 className="size-4" /></Button>;
}

export function CheckInButton({ checkedIn }: { checkedIn: boolean }) {
  const { pending, run } = useRun();
  return <Button variant={checkedIn ? "secondary" : "accent"} icon={checkedIn ? <LogOut className="size-4" /> : <LogIn className="size-4" />} loading={pending}
    onClick={() => run(() => checkInOutAction({}), { success: (r) => (r === "in" ? "Приход отмечен" : "Уход отмечен") })}>{checkedIn ? "Отметить уход" : "Отметить приход"}</Button>;
}
