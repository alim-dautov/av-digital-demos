"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarClock, Hourglass, MessageCircle, Phone, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, Field, Input, Modal, MoneyInput, Select, Skeleton, Textarea, cn } from "@/components/ui";
import { Kanban, type KCol } from "@/components/kanban";
import { useRun } from "@/components/use-run";
import { fmtDate, fmtRelative, money } from "@/lib/format";
import { SEGMENT_LABELS } from "@/lib/labels";
import { commentLeadAction, convertLeadAction, createLeadAction, deleteLeadAction, getLeadAction, moveLeadAction, updateLeadAction } from "@/modules/leads/actions";

export type LCard = { id: number; title: string; contactName: string; phone: string | null; amount: number; stageId: number; sort: number; managerName: string | null; managerColor: string | null;
  nextFollowUpAt: string | null; lastActivityAt: string; orderId: number | null; stageKind: string; segment: string; source: string };
type Person = { id: number; name: string };
type Stage = KCol & { kind: string };

export function LeadBoard({ stages, leads, people, canEdit, staleDays, managerAll }: { stages: Stage[]; leads: LCard[]; people: Person[]; canEdit: boolean; staleDays: number; managerAll: boolean }) {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const open = sp.get("open");
  const setOpen = (id: string | null) => { const q = new URLSearchParams(sp.toString()); if (id) q.set("open", id); else q.delete("open"); router.replace(`${path}?${q}`, { scroll: false }); };
  const kind = new Map(stages.map((s) => [s.id, s.kind]));
  const now = Date.now();
  return (
    <>
      <Kanban<LCard> columns={stages} items={leads} canDrag={canEdit}
        onMove={async (id, stageId, sort) => {
          let lostReason: string | undefined;
          if (kind.get(stageId) === "lost") { lostReason = prompt("Причина отказа?") ?? undefined; if (lostReason === undefined) return { ok: false, error: "Перемещение отменено" }; }
          return moveLeadAction({ id, stageId, sort, lostReason });
        }}
        colExtra={(c, items) => (
          <div className="flex items-center justify-between px-3 pb-1 text-xs text-ink-3">
            <span className="tnum">{money(items.reduce((s, x) => s + x.amount, 0))}</span>
            {canEdit && c.id === stages[0]?.id && <button onClick={() => setOpen("new")} className="flex items-center gap-1 font-semibold hover:text-ink"><Plus className="size-3.5" />Лид</button>}
          </div>
        )}
        render={(l) => {
          const stale = l.stageKind === "open" && now - new Date(l.lastActivityAt).getTime() > staleDays * 86400000;
          const fu = l.nextFollowUpAt ? new Date(l.nextFollowUpAt) : null;
          return (
            <button type="button" onClick={() => setOpen(String(l.id))} className={cn("w-full rounded-xl border bg-surface p-3 text-left transition-shadow duration-150 hover:shadow-md", stale ? "border-warning/60" : "border-line")}>
              <div className="flex items-start gap-2"><p className="min-w-0 flex-1 text-sm font-semibold leading-snug">{l.title}</p>{l.amount > 0 && <span className="tnum shrink-0 text-sm font-bold">{money(l.amount)}</span>}</div>
              {(l.contactName || l.phone) && <p className="mt-0.5 truncate text-xs text-ink-2">{[l.contactName, l.phone].filter(Boolean).join(" · ")}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
                {l.managerName && <Avatar name={l.managerName} color={l.managerColor ?? undefined} size={20} />}
                <Badge tone="neutral">{SEGMENT_LABELS[l.segment as keyof typeof SEGMENT_LABELS] ?? l.segment}</Badge>
                {fu && <span className={cn("flex items-center gap-1", fu.getTime() < now && "font-semibold text-danger")}><CalendarClock className="size-3.5" />{fmtDate(l.nextFollowUpAt, true)}</span>}
                {stale && <span className="flex items-center gap-1 text-warning"><Hourglass className="size-3.5" />без движения</span>}
                {l.orderId && <ShoppingCart className="ml-auto size-3.5 text-success" />}
              </div>
            </button>
          );
        }} />
      <Modal open={!!open} onClose={() => setOpen(null)} side="right" size="lg" title={open === "new" ? "Новый лид" : "Лид"}>
        {open === "new" ? <LeadForm people={people} managerAll={managerAll} onDone={(id) => setOpen(id ? String(id) : null)} />
          : open ? <LeadView key={open} id={Number(open)} people={people} managerAll={managerAll} canEdit={canEdit} onClose={() => setOpen(null)} /> : null}
      </Modal>
    </>
  );
}

type Full = Awaited<ReturnType<typeof getLeadAction>> extends infer R ? R extends { ok: true; data: infer D } ? D : never : never;
const toLocal = (v: string | Date | null) => { if (!v) return ""; const d = new Date(v); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

function LeadForm({ people, managerAll, initial, onDone }: { people: Person[]; managerAll: boolean; initial?: Full; onDone: (id?: number) => void }) {
  const [f, setF] = useState({
    title: initial?.title ?? "", contactName: initial?.contactName ?? "", phone: initial?.phone ?? "", source: initial?.source ?? "", amount: initial?.amount ?? 0,
    managerId: initial?.managerId ?? null as number | null, segment: (initial?.segment ?? "other") as "bazaar" | "shop" | "install" | "other", comment: initial?.comment ?? "", nextFollowUpAt: toLocal(initial?.nextFollowUpAt ?? null),
  });
  const { pending, run } = useRun();
  const submit = () => {
    const data = { ...f, phone: f.phone || null, nextFollowUpAt: f.nextFollowUpAt ? new Date(f.nextFollowUpAt).toISOString() : null, stageId: initial?.stageId, counterpartyId: initial?.counterpartyId };
    if (initial) run(() => updateLeadAction({ id: initial.id, data }), { success: "Сохранено", onOk: () => onDone(initial.id) });
    else run(() => createLeadAction(data), { success: "Лид создан", onOk: (l) => onDone(l.id) });
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Что хочет клиент" required><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus placeholder="Кабель на объект, 2 км" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Контакт"><Input value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} /></Field>
        <Field label="Телефон"><Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+7" /></Field>
        <Field label="Сумма (оценка)"><MoneyInput value={f.amount} onChange={(v) => setF({ ...f, amount: v })} /></Field>
        <Field label="Сегмент"><Select value={f.segment} onChange={(e) => setF({ ...f, segment: e.target.value as "other" })}>{Object.entries(SEGMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Источник"><Input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="WhatsApp, звонок, 2ГИС" /></Field>
        <Field label="Следующий контакт"><Input type="datetime-local" value={f.nextFollowUpAt} onChange={(e) => setF({ ...f, nextFollowUpAt: e.target.value })} /></Field>
        {managerAll && <Field label="Менеджер"><Select value={f.managerId ?? ""} onChange={(e) => setF({ ...f, managerId: e.target.value ? Number(e.target.value) : null })}><option value="">— я —</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>}
      </div>
      <Field label="Комментарий"><Textarea value={f.comment} onChange={(e) => setF({ ...f, comment: e.target.value })} className="min-h-20" /></Field>
      <div className="flex gap-2"><Button variant="accent" loading={pending} disabled={!f.title.trim()} onClick={submit}>{initial ? "Сохранить" : "Создать"}</Button><Button variant="ghost" onClick={() => onDone(initial?.id)}>Отмена</Button></div>
    </div>
  );
}

function LeadView({ id, people, managerAll, canEdit, onClose }: { id: number; people: Person[]; managerAll: boolean; canEdit: boolean; onClose: () => void }) {
  const router = useRouter();
  const [l, setL] = useState<Full | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState("");
  const load = async () => { const r = await getLeadAction({ id }); if (r.ok) setL(r.data as Full); else setErr(r.error); };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  const act = useRun();
  if (err) return <p className="text-sm text-danger">{err}</p>;
  if (!l) return <div className="flex flex-col gap-3"><Skeleton className="h-7 w-2/3" /><Skeleton className="h-32" /></div>;
  if (edit) return <LeadForm people={people} managerAll={managerAll} initial={l} onDone={() => { setEdit(false); load(); }} />;
  const wa = l.phone ? `https://wa.me/${l.phone.replace(/\D/g, "")}` : null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-lg font-bold">{l.title}</h3>
        <p className="mt-1 text-sm text-ink-2">{[l.contactName, l.phone, l.source].filter(Boolean).join(" · ")}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {l.amount > 0 && <Badge tone="info">{money(l.amount)}</Badge>}
          {l.nextFollowUpAt && <Badge tone={new Date(l.nextFollowUpAt) < new Date() ? "danger" : "neutral"}>контакт {fmtDate(l.nextFollowUpAt, true)}</Badge>}
          {l.lostReason && <Badge tone="danger">отказ: {l.lostReason}</Badge>}
        </div>
      </div>
      {l.comment && <p className="whitespace-pre-wrap text-sm">{l.comment}</p>}
      <div className="flex flex-wrap gap-2">
        {l.phone && <a href={`tel:${l.phone}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold"><Phone className="size-4" />Позвонить</a>}
        {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-semibold"><MessageCircle className="size-4" />WhatsApp</a>}
        {l.orderId ? <Link href={`/orders/${l.orderId}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-success-bg px-3 text-sm font-semibold text-success"><ShoppingCart className="size-4" />Открыть заявку</Link>
          : canEdit && <Button size="sm" variant="accent" icon={<ShoppingCart className="size-4" />} loading={act.pending} onClick={() => act.run(() => convertLeadAction({ id }), { success: "Клиент и заявка созданы", onOk: (r) => router.push(`/orders/${r.orderId}/edit`) })}>В клиента и заявку</Button>}
        {canEdit && <Button size="sm" onClick={() => setEdit(true)}>Изменить</Button>}
        {canEdit && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={() => confirm("Удалить лид?") && act.run(() => deleteLeadAction({ id }), { success: "Удалён", onOk: onClose })}>Удалить</Button>}
      </div>
      <section className="border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Итог разговора, договорённости…" className="min-h-16" />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={!text.trim()} loading={act.pending} onClick={() => act.run(() => commentLeadAction({ id, text, type: "comment" }), { refresh: false, onOk: () => { setText(""); load(); } })}>Комментарий</Button>
            <Button size="sm" icon={<Phone className="size-4" />} disabled={!text.trim()} onClick={() => act.run(() => commentLeadAction({ id, text, type: "call" }), { refresh: false, onOk: () => { setText(""); load(); } })}>Записать звонок</Button>
          </div>
        </div>
        <ol className="mt-4 flex flex-col gap-3 border-l-2 border-line pl-4">
          {l.events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span className={cn("absolute -left-[21px] top-1.5 size-2.5 rounded-full", e.type === "call" ? "bg-info" : e.type === "converted" ? "bg-success" : "bg-ink-3")} />
              <p className="text-xs text-ink-3">{e.userName ?? "Система"} · {fmtRelative(e.createdAt)}{e.type === "call" ? " · звонок" : ""}</p>
              <p className="whitespace-pre-wrap">{e.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
