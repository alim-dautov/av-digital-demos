"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { BadgeDollarSign, Send, Undo2 } from "lucide-react";
import { Button, Checkbox, Field, Input, Modal, Select } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { applyPricesAction, setPostedAction } from "@/modules/receipts/actions";

type PT = { id: number; name: string };
type Rule = { mode: "keep" } | { mode: "markup"; percent: number } | { mode: "keepMargin" };

export function PostToggle({ id, posted }: { id: number; posted: boolean }) {
  const { pending, run } = useRun();
  return posted
    ? <Button variant="secondary" icon={<Undo2 className="size-4" />} loading={pending} onClick={() => confirm("Отменить проведение? Остатки будут пересчитаны.") && run(() => setPostedAction({ id, posted: false }), { success: "Проведение отменено" })}>Отменить проведение</Button>
    : <Button variant="accent" icon={<Send className="size-4" />} loading={pending} onClick={() => run(() => setPostedAction({ id, posted: true }), { success: "Приёмка проведена" })}>Провести</Button>;
}

export function ApplyPrices({ id, types, changedCount }: { id: number; types: PT[]; changedCount: number }) {
  const sp = useSearchParams();
  const router = useRouter();
  const [open, setOpen] = useState(sp.get("prices") === "1" && changedCount > 0);
  const [purchase, setPurchase] = useState(true);
  const [rules, setRules] = useState<Record<string, Rule>>(() => Object.fromEntries(types.map((t) => [String(t.id), { mode: "keepMargin" } as Rule])));
  const { pending, run } = useRun();
  const close = () => { setOpen(false); if (sp.get("prices")) router.replace(`/receipts/${id}`); };
  return (
    <>
      <Button variant="secondary" icon={<BadgeDollarSign className="size-4" />} onClick={() => setOpen(true)}>Обновить цены</Button>
      <Modal open={open} onClose={close} title="Обновить цены по приёмке"
        footer={<><Button variant="ghost" onClick={close}>Не сейчас</Button>
          <Button variant="accent" loading={pending} onClick={() => run(() => applyPricesAction({ receiptId: id, updatePurchase: purchase, retail: rules }), { success: "Цены обновлены", onOk: (r) => { close(); return r; } })}>Применить</Button></>}>
        <div className="flex flex-col gap-4">
          {changedCount > 0 && <p className="rounded-xl bg-warning-bg px-3 py-2 text-sm">Закупочная цена изменилась у {changedCount} поз. относительно прошлой закупки</p>}
          <Checkbox checked={purchase} onChange={setPurchase} label="Записать цены приёмки как закупочные" />
          {types.map((t) => {
            const r = rules[String(t.id)];
            return (
              <div key={t.id} className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field label={t.name}>
                  <Select value={r.mode} onChange={(e) => setRules({ ...rules, [t.id]: e.target.value === "markup" ? { mode: "markup", percent: 30 } : { mode: e.target.value as "keep" | "keepMargin" } })}>
                    <option value="keepMargin">сохранить прежнюю наценку</option><option value="markup">наценка от закупки, %</option><option value="keep">не менять</option>
                  </Select>
                </Field>
                {r.mode === "markup" && <Input type="number" className="w-24 text-right" value={r.percent} onChange={(e) => setRules({ ...rules, [t.id]: { mode: "markup", percent: Number(e.target.value) || 0 } })} aria-label="Наценка %" />}
              </div>
            );
          })}
          <p className="text-xs text-ink-3">Цены округляются до тенге. Все изменения попадут в историю цен.</p>
        </div>
      </Modal>
    </>
  );
}
