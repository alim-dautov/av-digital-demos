"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadFile } from "@/components/file-upload";
import type { AppSettings, CompanySettings } from "@/modules/settings/store";
import { Button, Checkbox, Field, Input, Modal, MoneyInput, Select, Textarea, buttonClass } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { ACC_KINDS } from "@/lib/labels";
import { deleteStatusAction, saveCompanyAction, saveParamsAction, savePriceTypeAction, saveStatusAction, saveSynonymsAction } from "@/modules/settings/actions";
import { saveAccountAction, saveCategoryAction } from "@/modules/finance/actions";

export function CompanyForm({ value }: { value: CompanySettings }) {
  const [f, setF] = useState(value);
  const { pending, run } = useRun();
  const F = ({ k, label, hint, wide }: { k: Exclude<keyof CompanySettings, "stamp" | "stampFileId" | "signatureFileId">; label: string; hint?: string; wide?: boolean }) => (
    <Field label={label} hint={hint} className={wide ? "sm:col-span-2" : undefined}><Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>
  );
  return (
    <form className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveCompanyAction(f), { success: "Реквизиты сохранены" }); }}>
      {F({ k: "name", label: "Название (в шапке документов)" })}{F({ k: "legalName", label: "Юридическое название" })}
      {F({ k: "bin", label: "БИН", hint: "12 цифр" })}{F({ k: "director", label: "Руководитель" })}
      {F({ k: "address", label: "Адрес", wide: true })}
      {F({ k: "phone", label: "Телефон" })}{F({ k: "email", label: "E-mail" })}
      {F({ k: "bank", label: "Банк" })}{F({ k: "bik", label: "БИК" })}
      {F({ k: "iban", label: "ИИК (IBAN)" })}{F({ k: "website", label: "Сайт" })}
      <section className="flex flex-col gap-3 border-t border-line pt-4 sm:col-span-2">
        <h3 className="text-sm font-bold">Печать и подпись на документах</h3>
        <Field label="Печать в накладных, заказах, КП и актах сверки" className="sm:max-w-sm">
          <Select value={f.stamp} onChange={(e) => setF({ ...f, stamp: e.target.value as CompanySettings["stamp"] })}>
            <option value="auto">Электронная — из реквизитов</option>
            <option value="image">Скан нашей печати (PNG)</option>
            <option value="none">Без печати</option>
          </Select>
        </Field>
        {f.stamp !== "none" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {f.stamp === "image" && <ImagePick label="Скан печати" hint="PNG с прозрачным фоном, квадрат" value={f.stampFileId} onChange={(id) => setF({ ...f, stampFileId: id })} />}
            <ImagePick label="Факсимиле подписи (необязательно)" hint="PNG с прозрачным фоном" value={f.signatureFileId} onChange={(id) => setF({ ...f, signatureFileId: id })} />
          </div>
        )}
        <p className="text-xs text-ink-3">Изменения попадут в новые PDF и следующие версии документов; уже отправленные файлы не меняются.{f.stamp === "auto" ? " Электронная печать рисуется из юридического названия, БИН и адреса." : ""}</p>
      </section>
      <div className="sm:col-span-2"><Button variant="accent" type="submit" loading={pending}>Сохранить</Button></div>
    </form>
  );
}

/** Выбор PNG-картинки: загрузка в /api/files, превью, удаление */
function ImagePick({ label, hint, value, onChange }: { label: string; hint?: string; value: number | null; onChange: (id: number | null) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-[repeating-conic-gradient(var(--surface-2)_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {value ? <img src={`/api/files/${value}`} alt="" className="size-full object-contain" /> : <span className="text-xs text-ink-3">нет</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={buttonClass("secondary", "sm", "cursor-pointer")}>
            <Upload className="size-4" />{busy ? "Загрузка…" : value ? "Заменить" : "Загрузить PNG"}
            <input type="file" accept="image/png" className="sr-only" disabled={busy} onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.type !== "image/png") { toast.error("Нужен файл PNG"); return; }
              setBusy(true);
              try { onChange((await uploadFile(file)).id); toast.success("Загружено — не забудьте сохранить"); }
              catch (err) { toast.error((err as Error).message); }
              finally { setBusy(false); }
            }} />
          </label>
          {value && <Button size="sm" variant="ghost" type="button" onClick={() => onChange(null)}>Убрать</Button>}
        </div>
      </div>
    </Field>
  );
}

type Params = Pick<AppSettings, "debtPolicy" | "payroll" | "leads" | "tasks">;
export function ParamsForm({ value }: { value: Params }) {
  const [f, setF] = useState(value);
  const { pending, run } = useRun();
  return (
    <form className="flex flex-col gap-5 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveParamsAction(f), { success: "Параметры сохранены" }); }}>
      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="text-sm font-bold sm:col-span-2">Долги клиентов</h3>
        <Field label="Если клиент превысил лимит долга" hint="проверяется при проведении отгрузки">
          <Select value={f.debtPolicy.mode} onChange={(e) => setF({ ...f, debtPolicy: { mode: e.target.value as Params["debtPolicy"]["mode"] } })}>
            <option value="warn">Предупреждать</option><option value="block">Запрещать отгрузку</option><option value="none">Не проверять</option>
          </Select>
        </Field>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="text-sm font-bold sm:col-span-2">CRM</h3>
        <Field label="Лид считается зависшим через, дней"><Input type="number" min={1} max={60} value={f.leads.staleDays} onChange={(e) => setF({ ...f, leads: { staleDays: Number(e.target.value) || 1 } })} /></Field>
        <Field label="Напоминать о сроке задачи за, часов"><Input type="number" min={1} max={240} value={f.tasks.dueSoonHours} onChange={(e) => setF({ ...f, tasks: { dueSoonHours: Number(e.target.value) || 1 } })} /></Field>
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <h3 className="text-sm font-bold sm:col-span-2">Зарплата</h3>
        <Field label="Расчётный период">
          <Select value={f.payroll.periodKind} onChange={(e) => setF({ ...f, payroll: { ...f.payroll, periodKind: e.target.value as Params["payroll"]["periodKind"] } })}>
            <option value="month">Месяц</option><option value="half">Полмесяца</option><option value="week">Неделя</option>
          </Select>
        </Field>
        <div className="flex flex-col">
          <Checkbox label="Сотрудники видят свой заработок" checked={f.payroll.employeesSeeOwn} onChange={(v) => setF({ ...f, payroll: { ...f.payroll, employeesSeeOwn: v } })} />
          <Checkbox label="Самостоятельная отметка прихода/ухода" checked={f.payroll.selfCheckin} onChange={(v) => setF({ ...f, payroll: { ...f.payroll, selfCheckin: v } })} />
        </div>
        <Field label="Нарастающий штраф: первый за месяц" hint="подставляется в форму штрафа; 0 — сумму вводят вручную"><MoneyInput value={f.payroll.penaltyBase ?? 0} onChange={(v) => setF({ ...f, payroll: { ...f.payroll, penaltyBase: v } })} /></Field>
        <Field label="Каждый следующий штраф дороже на" hint="2-й = первый + шаг, 3-й = первый + 2 шага…"><MoneyInput value={f.payroll.penaltyStep ?? 0} onChange={(v) => setF({ ...f, payroll: { ...f.payroll, penaltyStep: v } })} /></Field>
      </section>
      <div><Button variant="accent" type="submit" loading={pending}>Сохранить</Button></div>
    </form>
  );
}

/** Словарь синонимов поиска: одна строка — одна группа, слова через «=» или запятую */
export function SynonymsForm({ value }: { value: string }) {
  const [v, setV] = useState(value);
  const { pending, run } = useRun();
  return (
    <form className="flex flex-col gap-3 p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); run(() => saveSynonymsAction({ synonyms: v }), { success: "Синонимы сохранены — поиск обновится через пару секунд" }); }}>
      <Field label="Группы синонимов" hint="одна строка — одна группа: «болгарка = ушм = угловая шлифмашина». Поиск по любому слову найдёт остальные">
        <Textarea rows={8} value={v} onChange={(e) => setV(e.target.value)} className="font-mono text-sm" spellCheck={false} />
      </Field>
      <div><Button variant="accent" type="submit" loading={pending}>Сохранить синонимы</Button></div>
    </form>
  );
}

/* ───── Справочники ───── */

type Acc = { id: number; name: string; kind: string; active: boolean };
export function AccountButton({ acc }: { acc?: Acc }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: acc?.name ?? "", kind: (acc?.kind ?? "cash") as keyof typeof ACC_KINDS, active: acc?.active ?? true });
  const { pending, run } = useRun();
  return (
    <>
      {acc ? <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${acc.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Касса</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title={acc ? "Касса / счёт" : "Новая касса"} size="sm"
        footer={<Button variant="accent" loading={pending} disabled={!f.name} onClick={() => run(() => saveAccountAction({ id: acc?.id, ...f }), { success: "Сохранено", onOk: () => setOpen(false) })}>Сохранить</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Название"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Тип"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as keyof typeof ACC_KINDS })}>{Object.entries(ACC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {acc && <Checkbox label="Активна" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        </div>
      </Modal>
    </>
  );
}

export function CategoryButton({ cat, kind }: { cat?: { id: number; name: string }; kind: "income" | "expense" }) {
  const [name, setName] = useState(cat?.name ?? "");
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun();
  return (
    <>
      {cat ? <Button variant="ghost" size="icon-sm" aria-label={`Переименовать ${cat.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Статья</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title={cat ? "Статья" : kind === "income" ? "Новая статья прихода" : "Новая статья расхода"} size="sm"
        footer={<Button variant="accent" loading={pending} disabled={!name.trim()} onClick={() => run(() => saveCategoryAction({ id: cat?.id, name, kind }), { success: "Сохранено", onOk: () => { setOpen(false); if (!cat) setName(""); } })}>Сохранить</Button>}>
        <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      </Modal>
    </>
  );
}

type PT = { id: number; name: string; sort: number; active: boolean; isPurchase: boolean };
export function PriceTypeButton({ t }: { t?: PT }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: t?.name ?? "", sort: t?.sort ?? 50, active: t?.active ?? true });
  const { pending, run } = useRun();
  return (
    <>
      {t ? <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${t.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Тип цены</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title="Тип цены" size="sm"
        footer={<Button variant="accent" loading={pending} disabled={!f.name} onClick={() => run(() => savePriceTypeAction({ id: t?.id, ...f }), { success: "Сохранено", onOk: () => setOpen(false) })}>Сохранить</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Название"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Порядок"><Input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></Field>
          {!t?.isPurchase && <Checkbox label="Используется" checked={f.active} onChange={(v) => setF({ ...f, active: v })} />}
        </div>
      </Modal>
    </>
  );
}

type St = { id: number; code: string; name: string; color: string; sort: number; isFinal: boolean; isCancelled: boolean };
export function StatusButton({ s }: { s?: St }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: s?.name ?? "", color: s?.color ?? "#2563EB", sort: s?.sort ?? 50, isFinal: s?.isFinal ?? false, isCancelled: s?.isCancelled ?? false });
  const { pending, run } = useRun();
  const system = !!s && !s.code.startsWith("custom_");
  return (
    <>
      {s ? <Button variant="ghost" size="icon-sm" aria-label={`Изменить ${s.name}`} onClick={() => setOpen(true)}><Pencil className="size-4" /></Button>
        : <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Статус</Button>}
      <Modal open={open} onClose={() => setOpen(false)} title="Статус заявки" size="sm"
        footer={<Button variant="accent" loading={pending} disabled={!f.name} onClick={() => run(() => saveStatusAction({ id: s?.id, ...f }), { success: "Сохранено", onOk: () => setOpen(false) })}>Сохранить</Button>}>
        <div className="flex flex-col gap-3">
          <Field label="Название"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Цвет"><Input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-11 p-1" /></Field>
            <Field label="Порядок"><Input type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: Number(e.target.value) })} /></Field>
          </div>
          {system ? <p className="text-xs text-ink-3">Системный статус: логика (финальный/отмена) фиксирована.</p> : <>
            <Checkbox label="Финальный (заявка закрыта)" checked={f.isFinal} onChange={(v) => setF({ ...f, isFinal: v })} />
            <Checkbox label="Отмена (резерв снимается)" checked={f.isCancelled} onChange={(v) => setF({ ...f, isCancelled: v })} />
          </>}
        </div>
      </Modal>
    </>
  );
}
export function DeleteStatus({ id, name }: { id: number; name: string }) {
  const { pending, run } = useRun();
  return <Button variant="ghost" size="icon-sm" aria-label={`Удалить ${name}`} loading={pending} onClick={() => confirm(`Удалить статус «${name}»?`) && run(() => deleteStatusAction({ id }), { success: "Удалено" })}><Trash2 className="size-4" /></Button>;
}
