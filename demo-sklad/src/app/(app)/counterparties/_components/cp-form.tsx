"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, MoneyInput, Select, Textarea, cn } from "@/components/ui";
import { Attachments, type FileRef } from "@/components/file-upload";
import { useRun } from "@/components/use-run";
import { CP_KINDS, DEBT_MODES, SEGMENT_LABELS } from "@/lib/labels";
import { createCpAction, deleteCpAction, updateCpAction } from "@/modules/counterparties/actions";

export type CpData = {
  id?: number; kind: "client" | "supplier" | "both"; name: string; segment: "bazaar" | "shop" | "install" | "other"; tags: string[];
  phone: string | null; whatsapp: string | null; email: string | null; address: string | null; bin: string | null; comment: string;
  contacts: { name: string; phone?: string; role?: string }[]; documents: FileRef[]; managerId: number | null; debtLimit: number;
  debtLimitMode: "default" | "warn" | "block" | "none"; isService?: boolean;
};

export function CpForm({ initial, managers, allTags, edit }: { initial: CpData; managers: { id: number; name: string }[]; allTags: string[]; edit: boolean }) {
  const [f, setF] = useState(initial);
  const [tag, setTag] = useState("");
  const set = <K extends keyof CpData>(k: K, v: CpData[K]) => setF((x) => ({ ...x, [k]: v }));
  const router = useRouter();
  const { pending, run } = useRun();
  const addTag = (t: string) => { const v = t.trim(); if (v && !f.tags.includes(v)) set("tags", [...f.tags, v]); setTag(""); };
  const save = () => {
    const { id, isService: _s, ...data } = f;
    const clean = { ...data, phone: data.phone || null, whatsapp: data.whatsapp || null, email: data.email || null, address: data.address || null, bin: data.bin || null };
    if (id) run(() => updateCpAction({ id, data: clean }), { success: "Сохранено" });
    else run(() => createCpAction(clean), { success: "Контрагент добавлен", onOk: (c) => router.replace(`/counterparties/${c.id}`) });
  };
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Card>
        <CardHeader title="Карточка" />
        <fieldset disabled={!edit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Field label="Название" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set("name", e.target.value)} required placeholder="ИП Ахметов (Рынок, ряд 12)" /></Field>
          <Field label="Тип"><Select value={f.kind} onChange={(e) => set("kind", e.target.value as CpData["kind"])} disabled={f.isService}>{Object.entries(CP_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Сегмент" hint="Определяет тип цены по умолчанию в заявке"><Select value={f.segment} onChange={(e) => set("segment", e.target.value as CpData["segment"])}>{Object.entries(SEGMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label="Телефон"><Input type="tel" inputMode="tel" value={f.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+7 7__ ___ __ __" /></Field>
          <Field label="WhatsApp"><Input type="tel" inputMode="tel" value={f.whatsapp ?? ""} onChange={(e) => set("whatsapp", e.target.value)} placeholder="если отличается" /></Field>
          <Field label="Email"><Input type="email" value={f.email ?? ""} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="БИН / ИИН"><Input inputMode="numeric" value={f.bin ?? ""} onChange={(e) => set("bin", e.target.value)} maxLength={12} /></Field>
          <Field label="Адрес" className="sm:col-span-2"><Input value={f.address ?? ""} onChange={(e) => set("address", e.target.value)} /></Field>
          <Field label="Ответственный менеджер">
            <Select value={f.managerId ?? ""} onChange={(e) => set("managerId", e.target.value ? Number(e.target.value) : null)}><option value="">— не назначен —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</Select>
          </Field>
          <Field label="Теги">
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-surface p-1.5">
              {f.tags.map((t) => <span key={t} className="inline-flex h-8 items-center gap-1 rounded-lg bg-surface-2 pl-2.5 pr-1 text-sm font-medium">{t}<button type="button" aria-label={`Убрать ${t}`} onClick={() => set("tags", f.tags.filter((x) => x !== t))} className="grid size-6 place-items-center rounded text-ink-3 hover:text-ink"><X className="size-3.5" /></button></span>)}
              <input list="cp-tags" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tag); } }} onBlur={() => tag && addTag(tag)}
                className="h-8 min-w-24 flex-1 bg-transparent px-1.5 text-sm focus:outline-none" placeholder="добавить…" />
              <datalist id="cp-tags">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </Field>
          <Field label="Комментарий" className="sm:col-span-2"><Textarea value={f.comment} onChange={(e) => set("comment", e.target.value)} /></Field>
        </fieldset>
      </Card>
      {f.kind !== "supplier" && (
        <Card>
          <CardHeader title="Лимит долга" subtitle="Проверяется при отгрузке" />
          <fieldset disabled={!edit} className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Лимит" hint="0 — без лимита"><MoneyInput value={f.debtLimit} onChange={(v) => set("debtLimit", v)} /></Field>
            <Field label="При превышении"><Select value={f.debtLimitMode} onChange={(e) => set("debtLimitMode", e.target.value as CpData["debtLimitMode"])}>{Object.entries(DEBT_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </fieldset>
        </Card>
      )}
      <Card>
        <CardHeader title="Контактные лица" action={edit && <Button type="button" size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => set("contacts", [...f.contacts, { name: "", phone: "", role: "" }])}>Добавить</Button>} />
        <div className="flex flex-col gap-2 p-4 sm:p-5">
          {f.contacts.length === 0 && <p className="text-sm text-ink-3">Не указаны</p>}
          {f.contacts.map((c, i) => (
            <fieldset key={i} disabled={!edit} className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <Input value={c.name} placeholder="Имя" onChange={(e) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Input value={c.phone ?? ""} placeholder="Телефон" type="tel" onChange={(e) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, phone: e.target.value } : x)))} />
              <Input value={c.role ?? ""} placeholder="Должность" className="hidden sm:block" onChange={(e) => set("contacts", f.contacts.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
              <Button type="button" variant="ghost" size="icon" aria-label="Удалить контакт" onClick={() => set("contacts", f.contacts.filter((_, j) => j !== i))}><X className="size-4" /></Button>
            </fieldset>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Документы" subtitle="договоры, доверенности, реквизиты" />
        <div className="p-4 sm:p-5"><Attachments value={f.documents} onChange={(v) => set("documents", v)} max={edit ? 20 : 0} /></div>
      </Card>
      {edit && (
        <div className={cn("sticky bottom-[72px] z-20 -mx-4 flex gap-2 border-t border-line bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border lg:bottom-4")}>
          {f.id && !f.isService && <Button type="button" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} disabled={pending}
            onClick={() => confirm("Удалить контрагента? Документы по нему сохранятся.") && run(() => deleteCpAction({ id: f.id! }), { success: "Удалено", onOk: () => router.replace("/counterparties") })}>Удалить</Button>}
          <Button type="submit" variant="accent" className="ml-auto" loading={pending} icon={<Save className="size-4" />}>Сохранить</Button>
        </div>
      )}
    </form>
  );
}
