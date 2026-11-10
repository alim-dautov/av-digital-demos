"use client";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button, Field, Input, Modal, Select, Switch } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { saveRuleAction } from "@/modules/payroll/actions";

export type Rule = {
  id?: number; name: string; authorMatch: "user" | "sales_manager" | "any"; authorUserId: number | null; recipientMode: "author" | "user" | "manager"; recipientUserId: number | null;
  rateBp: number; base: "order_total" | "shipment_revenue" | "profit"; moment: "order_created" | "shipment" | "paid"; segment: "bazaar" | "shop" | "install" | "other" | null; active: boolean; validFrom: string | null;
};
const EMPTY: Rule = { name: "", authorMatch: "user", authorUserId: null, recipientMode: "author", recipientUserId: null, rateBp: 100, base: "order_total", moment: "order_created", segment: null, active: true, validFrom: null };

export function RuleButton({ rule, people }: { rule?: Rule; people: { id: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [r, setR] = useState<Rule>(rule ?? EMPTY);
  const [rate, setRate] = useState(String((rule?.rateBp ?? 100) / 100).replace(".", ","));
  const { pending, run } = useRun();
  const save = () => run(() => saveRuleAction({ ...r, rateBp: Math.round((Number(rate.replace(",", ".")) || 0) * 100) }), { success: "Правило сохранено", onOk: () => setOpen(false) });
  return (
    <>
      {rule ? <Button variant="ghost" size="icon-sm" aria-label="Изменить правило" onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="secondary" icon={<Plus className="size-4" />} onClick={() => { setR(EMPTY); setOpen(true); }}>Правило</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title={rule ? "Правило начисления" : "Новое правило"}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button variant="accent" loading={pending} disabled={!r.name.trim()} onClick={save}>Сохранить</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Название" required><Input value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Арман: 1% со своих заявок" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Кто создал заявку"><Select value={r.authorMatch} onChange={(e) => setR({ ...r, authorMatch: e.target.value as "user" })}><option value="user">конкретный сотрудник</option><option value="sales_manager">любой менеджер</option><option value="any">кто угодно</option></Select></Field>
            {r.authorMatch === "user" && <Field label="Автор"><Select value={r.authorUserId ?? ""} onChange={(e) => setR({ ...r, authorUserId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
            <Field label="Кому начислять"><Select value={r.recipientMode} onChange={(e) => setR({ ...r, recipientMode: e.target.value as "author" })}><option value="author">автору заявки</option><option value="manager">менеджеру клиента</option><option value="user">конкретному сотруднику</option></Select></Field>
            {r.recipientMode === "user" && <Field label="Получатель"><Select value={r.recipientUserId ?? ""} onChange={(e) => setR({ ...r, recipientUserId: e.target.value ? Number(e.target.value) : null })}><option value="">—</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
            <Field label="Ставка, %"><Input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
            <Field label="От чего"><Select value={r.base} onChange={(e) => setR({ ...r, base: e.target.value as "order_total" })}><option value="order_total">сумма заявки</option><option value="shipment_revenue">сумма отгрузки</option><option value="profit">прибыль</option></Select></Field>
            <Field label="Когда засчитывать"><Select value={r.moment} onChange={(e) => setR({ ...r, moment: e.target.value as "order_created" })}><option value="order_created">при создании заявки</option><option value="shipment">после отгрузки</option><option value="paid">после оплаты</option></Select></Field>
            <Field label="Только сегмент"><Select value={r.segment ?? ""} onChange={(e) => setR({ ...r, segment: (e.target.value || null) as Rule["segment"] })}><option value="">все</option><option value="bazaar">Базар</option><option value="shop">Магазины</option><option value="install">Монтаж</option><option value="other">Прочее</option></Select></Field>
            <Field label="Действует с"><Input type="date" value={r.validFrom ?? ""} onChange={(e) => setR({ ...r, validFrom: e.target.value || null })} /></Field>
          </div>
          <Switch checked={r.active} onChange={(v) => setR({ ...r, active: v })} label="Правило активно" />
          <p className="text-xs text-ink-3">Начисление создаётся по заявке и пересчитывается при её изменении; отмена заявки аннулирует начисление, возврат — уменьшает. Одна заявка не начисляется дважды по одному правилу.</p>
        </div>
      </Modal>
    </>
  );
}
