"use client";
import { useState } from "react";
import { ArrowLeftRight, Minus, Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { today } from "@/lib/format";
import { createFinTxAction, deleteFinTxAction } from "@/modules/finance/actions";

type Acc = { id: number; name: string };
type Cat = { id: number; name: string; kind: string; code: string | null };
type Kind = "income" | "expense" | "transfer";

export function FinTxButtons({ accounts, categories }: { accounts: Acc[]; categories: Cat[] }) {
  const [kind, setKind] = useState<Kind | null>(null);
  return (
    <>
      <Button variant="accent" icon={<Plus className="size-4" />} onClick={() => setKind("income")}>Приход</Button>
      <Button variant="secondary" icon={<Minus className="size-4" />} onClick={() => setKind("expense")}>Расход</Button>
      <Button variant="ghost" icon={<ArrowLeftRight className="size-4" />} onClick={() => setKind("transfer")}>Перевод</Button>
      {kind && <TxModal kind={kind} setKind={setKind} accounts={accounts} categories={categories} />}
    </>
  );
}

function TxModal({ kind, setKind, accounts, categories }: { kind: Kind; setKind: (k: Kind | null) => void; accounts: Acc[]; categories: Cat[] }) {
  const [f, setF] = useState({ date: today(), accountId: accounts[0]?.id ?? 0, toAccountId: accounts[1]?.id ?? null as number | null, categoryId: null as number | null, amount: 0, comment: "" });
  const { pending, run } = useRun();
  // зарплата проводится через раздел «Зарплата»; системные категории оплат — через платежи
  const cats = categories.filter((c) => c.kind === kind && !["salary", "client_payment", "supplier_payment"].includes(c.code ?? ""));
  const title = { income: "Приход в кассу", expense: "Расход", transfer: "Перевод между кассами" }[kind];
  return (
    <Modal open onClose={() => setKind(null)} title={title} size="sm"
      footer={<><Button variant="ghost" onClick={() => setKind(null)}>Отмена</Button>
        <Button variant="accent" loading={pending} disabled={f.amount <= 0 || (kind !== "transfer" && !f.categoryId)} onClick={() => run(() => createFinTxAction({ ...f, kind, toAccountId: kind === "transfer" ? f.toAccountId : null }), { success: "Операция проведена", onOk: () => setKind(null) })}>Провести</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-1.5">
          {(["income", "expense", "transfer"] as const).map((k) => <button key={k} type="button" onClick={() => setKind(k)} className={cn("h-10 rounded-xl border text-sm font-semibold", kind === k ? "border-yellow bg-yellow/15" : "border-line text-ink-2")}>{{ income: "Приход", expense: "Расход", transfer: "Перевод" }[k]}</button>)}
        </div>
        <Field label="Сумма"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "transfer" ? "Откуда" : "Касса"}><Select value={f.accountId} onChange={(e) => setF({ ...f, accountId: Number(e.target.value) })}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          {kind === "transfer"
            ? <Field label="Куда"><Select value={f.toAccountId ?? ""} onChange={(e) => setF({ ...f, toAccountId: Number(e.target.value) })}>{accounts.filter((a) => a.id !== f.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
            : <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>}
        </div>
        {kind !== "transfer" && <Field label="Статья" required><Select value={f.categoryId ?? ""} onChange={(e) => setF({ ...f, categoryId: e.target.value ? Number(e.target.value) : null })}><option value="">— выберите —</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
        <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="min-h-16" /></Field>
      </div>
    </Modal>
  );
}

export function DeleteTx({ id }: { id: number }) {
  const { pending, run } = useRun();
  return <Button variant="ghost" size="icon-sm" aria-label="Удалить операцию" loading={pending} onClick={() => confirm("Удалить операцию?") && run(() => deleteFinTxAction({ id }), { success: "Удалено" })}><Trash2 className="size-4" /></Button>;
}
