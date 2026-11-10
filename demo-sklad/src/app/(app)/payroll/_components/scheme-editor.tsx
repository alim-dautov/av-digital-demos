"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Field, Input, Modal, MoneyInput, Select, Switch, Textarea } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { today } from "@/lib/format";
import { saveSchemeAction } from "@/modules/payroll/actions";
import type { PaySchemeComponents } from "@/modules/payroll/types";

type C = PaySchemeComponents;
const DEF = {
  salary: { amount: 0, prorate: true, workWeek: 6 as 5 | 6 },
  salesPercent: { basis: "revenue" as const, scope: "own" as const, trigger: "shipment" as const, tierMode: "whole" as const, tiers: [{ fromPlanPct: 0, rateBp: 100 }], countReturns: true, skipNonPositiveMargin: false, excludeProductIds: [], excludeFolderIds: [] },
  piecework: { per: "order" as const, rate: 0, minPerShift: 0 },
  kpiBonus: { planThresholds: [] as { pct: number; amount: number }[] },
  allowances: { weekendDay: 0, overtimeHour: 0, normHours: 8 },
};

/** Процент в базисных пунктах: 1% = 100 bp */
const bpIn = (bp: number) => String(bp / 100).replace(".", ",");
const bpOut = (s: string) => Math.round((Number(s.replace(",", ".")) || 0) * 100);

export function SchemeButton({ userId, name, current }: { userId: number; name: string; current: C | null }) {
  const [open, setOpen] = useState(false);
  const [c, setC] = useState<C>(current ?? {});
  const [from, setFrom] = useState(today().slice(0, 8) + "01");
  const [comment, setComment] = useState("");
  const { pending, run } = useRun();
  const toggle = <K extends keyof C>(k: K, on: boolean) => setC((x) => { const n = { ...x }; if (on) (n as Record<string, unknown>)[k] = structuredClone(DEF[k as keyof typeof DEF]); else delete n[k]; return n; });
  const sp = c.salesPercent;
  return (
    <>
      <Button size="sm" onClick={() => { setC(current ?? {}); setOpen(true); }}>{current ? "Изменить схему" : "Задать схему"}</Button>
      <Modal open={open} onClose={() => setOpen(false)} side="right" size="lg" title={`Схема оплаты: ${name}`}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Отмена</Button><Button variant="accent" loading={pending} onClick={() => run(() => saveSchemeAction({ userId, validFrom: from, components: c, comment }), { success: "Схема сохранена — расчёты пересчитаны", onOk: () => setOpen(false) })}>Сохранить версию</Button></>}>
        <div className="flex flex-col gap-5">
          <Field label="Действует с" hint="новая версия не меняет закрытые периоды"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>

          <Section title="Оклад" on={!!c.salary} onToggle={(v) => toggle("salary", v)}>
            {c.salary && <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Сумма в месяц"><MoneyInput value={c.salary.amount} onChange={(v) => setC({ ...c, salary: { ...c.salary!, amount: v } })} /></Field>
              <Field label="Рабочая неделя"><Select value={c.salary.workWeek} onChange={(e) => setC({ ...c, salary: { ...c.salary!, workWeek: Number(e.target.value) as 5 } })}><option value={6}>6 дней</option><option value={5}>5 дней</option></Select></Field>
              <div className="flex items-end pb-2"><Switch checked={c.salary.prorate} onChange={(v) => setC({ ...c, salary: { ...c.salary!, prorate: v } })} label="Пропорционально табелю" /></div>
            </div>}
          </Section>

          <Section title="Процент с продаж" on={!!sp} onToggle={(v) => toggle("salesPercent", v)}>
            {sp && <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="База"><Select value={sp.basis} onChange={(e) => setC({ ...c, salesPercent: { ...sp, basis: e.target.value as "revenue" } })}><option value="revenue">выручка</option><option value="profit">валовая прибыль</option></Select></Field>
                <Field label="Чьи продажи"><Select value={sp.scope} onChange={(e) => setC({ ...c, salesPercent: { ...sp, scope: e.target.value as "own" } })}><option value="own">свои клиенты</option><option value="segment">сегмент</option><option value="department">весь отдел</option></Select></Field>
                <Field label="Когда считать"><Select value={sp.trigger} onChange={(e) => setC({ ...c, salesPercent: { ...sp, trigger: e.target.value as "shipment" } })}><option value="shipment">по отгрузке</option><option value="paid">по оплате</option></Select></Field>
                {sp.scope === "segment" && <Field label="Сегмент"><Select value={sp.segment ?? "bazaar"} onChange={(e) => setC({ ...c, salesPercent: { ...sp, segment: e.target.value as "bazaar" } })}><option value="bazaar">Базар</option><option value="shop">Магазины</option><option value="install">Монтаж</option><option value="other">Прочее</option></Select></Field>}
                <Field label="Ступени"><Select value={sp.tierMode} onChange={(e) => setC({ ...c, salesPercent: { ...sp, tierMode: e.target.value as "whole" } })}><option value="whole">ставка на весь объём</option><option value="marginal">прогрессивно по частям</option></Select></Field>
              </div>
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 text-xs font-semibold text-ink-3">Ставка в зависимости от выполнения плана</p>
                {sp.tiers.map((t, i) => (
                  <div key={i} className="mb-2 flex items-center gap-2 text-sm">
                    <span className="text-ink-3">от</span><Input className="w-20 text-right" type="number" value={t.fromPlanPct} onChange={(e) => setC({ ...c, salesPercent: { ...sp, tiers: sp.tiers.map((x, j) => (j === i ? { ...x, fromPlanPct: Number(e.target.value) || 0 } : x)) } })} aria-label="Порог плана %" />
                    <span className="text-ink-3">% плана →</span><Input className="w-20 text-right" inputMode="decimal" defaultValue={bpIn(t.rateBp)} onBlur={(e) => setC({ ...c, salesPercent: { ...sp, tiers: sp.tiers.map((x, j) => (j === i ? { ...x, rateBp: bpOut(e.target.value) } : x)) } })} aria-label="Ставка %" /><span>%</span>
                    {sp.tiers.length > 1 && <Button variant="ghost" size="icon-sm" aria-label="Убрать ступень" onClick={() => setC({ ...c, salesPercent: { ...sp, tiers: sp.tiers.filter((_, j) => j !== i) } })}><X className="size-4" /></Button>}
                  </div>
                ))}
                <Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setC({ ...c, salesPercent: { ...sp, tiers: [...sp.tiers, { fromPlanPct: (sp.tiers.at(-1)?.fromPlanPct ?? 0) + 50, rateBp: (sp.tiers.at(-1)?.rateBp ?? 100) + 50 }] } })}>Ступень</Button>
              </div>
              <div className="flex flex-wrap gap-4">
                <Switch checked={sp.countReturns} onChange={(v) => setC({ ...c, salesPercent: { ...sp, countReturns: v } })} label="Вычитать возвраты" />
                <Switch checked={sp.skipNonPositiveMargin} onChange={(v) => setC({ ...c, salesPercent: { ...sp, skipNonPositiveMargin: v } })} label="Не платить с убыточных продаж" />
              </div>
            </div>}
          </Section>

          <Section title="Сдельно (сборка)" on={!!c.piecework} onToggle={(v) => toggle("piecework", v)}>
            {c.piecework && <div className="grid gap-3 sm:grid-cols-3">
              <Field label="За"><Select value={c.piecework.per} onChange={(e) => setC({ ...c, piecework: { ...c.piecework!, per: e.target.value as "order" } })}><option value="order">заявку</option><option value="item">позицию</option><option value="unit">единицу</option></Select></Field>
              <Field label="Ставка"><MoneyInput value={c.piecework.rate} onChange={(v) => setC({ ...c, piecework: { ...c.piecework!, rate: v } })} /></Field>
              <Field label="Минимум за смену"><MoneyInput value={c.piecework.minPerShift} onChange={(v) => setC({ ...c, piecework: { ...c.piecework!, minPerShift: v } })} /></Field>
            </div>}
          </Section>

          <Section title="Бонусы за KPI" on={!!c.kpiBonus} onToggle={(v) => toggle("kpiBonus", v)}>
            {c.kpiBonus && <div className="flex flex-col gap-2">
              {c.kpiBonus.planThresholds.map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-ink-3">план ≥</span><Input className="w-20 text-right" type="number" value={t.pct} onChange={(e) => setC({ ...c, kpiBonus: { ...c.kpiBonus!, planThresholds: c.kpiBonus!.planThresholds.map((x, j) => (j === i ? { ...x, pct: Number(e.target.value) || 0 } : x)) } })} aria-label="Порог %" />
                  <span className="text-ink-3">% → бонус</span><div className="w-36"><MoneyInput value={t.amount} onChange={(v) => setC({ ...c, kpiBonus: { ...c.kpiBonus!, planThresholds: c.kpiBonus!.planThresholds.map((x, j) => (j === i ? { ...x, amount: v } : x)) } })} /></div>
                  <Button variant="ghost" size="icon-sm" aria-label="Убрать" onClick={() => setC({ ...c, kpiBonus: { ...c.kpiBonus!, planThresholds: c.kpiBonus!.planThresholds.filter((_, j) => j !== i) } })}><X className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-start" icon={<Plus className="size-4" />} onClick={() => setC({ ...c, kpiBonus: { ...c.kpiBonus!, planThresholds: [...c.kpiBonus!.planThresholds, { pct: 100, amount: 0 }] } })}>Порог плана</Button>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Switch checked={!!c.kpiBonus.tasksOnTime} onChange={(v) => setC({ ...c, kpiBonus: { ...c.kpiBonus!, tasksOnTime: v ? { pct: 90, amount: 0 } : undefined } })} label="За задачи в срок" />
                {c.kpiBonus.tasksOnTime && <><span className="text-ink-3">≥</span><Input className="w-16 text-right" type="number" value={c.kpiBonus.tasksOnTime.pct} onChange={(e) => setC({ ...c, kpiBonus: { ...c.kpiBonus!, tasksOnTime: { ...c.kpiBonus!.tasksOnTime!, pct: Number(e.target.value) || 0 } } })} aria-label="% в срок" /><span className="text-ink-3">% →</span>
                  <div className="w-36"><MoneyInput value={c.kpiBonus.tasksOnTime.amount} onChange={(v) => setC({ ...c, kpiBonus: { ...c.kpiBonus!, tasksOnTime: { ...c.kpiBonus!.tasksOnTime!, amount: v } } })} /></div></>}
              </div>
            </div>}
          </Section>

          <Section title="Доплаты" on={!!c.allowances} onToggle={(v) => toggle("allowances", v)}>
            {c.allowances && <div className="grid gap-3 sm:grid-cols-3">
              <Field label="За выход в выходной"><MoneyInput value={c.allowances.weekendDay} onChange={(v) => setC({ ...c, allowances: { ...c.allowances!, weekendDay: v } })} /></Field>
              <Field label="За час сверхурочно"><MoneyInput value={c.allowances.overtimeHour} onChange={(v) => setC({ ...c, allowances: { ...c.allowances!, overtimeHour: v } })} /></Field>
              <Field label="Норма часов в день"><Input type="number" min={1} max={24} value={c.allowances.normHours} onChange={(e) => setC({ ...c, allowances: { ...c.allowances!, normHours: Number(e.target.value) || 8 } })} /></Field>
            </div>}
          </Section>
          <Field label="Комментарий к версии"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} className="min-h-14" placeholder="Например: повышение с ноября" /></Field>
        </div>
      </Modal>
    </>
  );
}

function Section({ title, on, onToggle, children }: { title: string; on: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line p-4">
      <div className="flex items-center justify-between"><h4 className="font-bold">{title}</h4><Switch checked={on} onChange={onToggle} label={on ? "вкл" : "выкл"} /></div>
      {on && <div className="mt-3">{children}</div>}
    </section>
  );
}
