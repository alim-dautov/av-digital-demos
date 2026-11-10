"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Copy, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { copyOrderAction, deleteOrderAction, rescheduleAction, setStatusAction } from "@/modules/orders/actions";

type St = { id: number; name: string; color: string; code: string; isCancelled: boolean };

/** Переключатель статуса: кнопки по порядку воронки */
export function StatusFlow({ orderId, statuses, current, edit, willShip }: { orderId: number; statuses: St[]; current: number; edit: boolean; willShip?: boolean }) {
  const { pending, run } = useRun();
  const [comment, setComment] = useState<{ id: number } | null>(null);
  const [text, setText] = useState("");
  // выбранный, но ещё не подтверждённый статус: меняется только по «Готово»
  const [picked, setPicked] = useState<St | null>(null);
  const idx = statuses.findIndex((s) => s.id === current);
  const flow = statuses.filter((s) => !s.isCancelled);
  return (
    <>
      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        {flow.map((s) => {
          const i = statuses.findIndex((x) => x.id === s.id);
          const done = i < idx, cur = s.id === current;
          return (
            <button key={s.id} type="button" disabled={!edit || pending || cur} onClick={() => setPicked(picked?.id === s.id ? null : s)}
              className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-all duration-200 disabled:cursor-default",
                cur ? "border-transparent text-white shadow-sm" : picked?.id === s.id ? "border-ink bg-surface text-ink ring-2 ring-[var(--ring)]" : done ? "border-line bg-surface text-ink-2" : "border-dashed border-line-strong text-ink-3 hover:border-solid hover:text-ink")}
              style={cur ? { background: s.color } : undefined}>
              <span className="size-2 rounded-full" style={{ background: cur ? "#fff" : s.color, opacity: done || cur ? 1 : 0.5 }} />{s.name}
            </button>
          );
        })}
        {edit && statuses.filter((s) => s.isCancelled).map((s) => (
          <button key={s.id} type="button" disabled={pending || s.id === current} onClick={() => { setComment({ id: s.id }); setText(""); }}
            className={cn("inline-flex h-10 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold", s.id === current ? "bg-surface-2 text-ink-2" : "text-ink-3 hover:text-danger")}>{s.id === current ? s.name : "Отменить"}</button>
        ))}
      </div>
      {picked && (
        <div className="animate-in mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">Сменить статус на <b>«{picked.name}»</b>?{willShip && (picked.code === "delivered" || picked.code === "paid") && <span className="block text-xs text-ink-3">Неотгруженные позиции сразу уйдут в отгрузку и спишутся со склада</span>}</span>
          <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>Отмена</Button>
          <Button size="sm" variant="accent" loading={pending} onClick={() => run(() => setStatusAction({ id: orderId, statusId: picked.id }), { success: `Статус: ${picked.name}`, onOk: () => setPicked(null) })}>Готово</Button>
        </div>
      )}
      <Modal open={!!comment} onClose={() => setComment(null)} title="Отмена заявки" size="sm"
        footer={<><Button onClick={() => setComment(null)}>Назад</Button><Button variant="danger" loading={pending} onClick={() => comment && run(() => setStatusAction({ id: orderId, statusId: comment.id, comment: text || undefined }), { success: "Заявка отменена", onOk: () => setComment(null) })}>Отменить заявку</Button></>}>
        <Field label="Причина" hint="Начисления по заявке будут аннулированы"><Textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus /></Field>
      </Modal>
    </>
  );
}

export function OrderMenu({ orderId, number, deliveryDate }: { orderId: number; number: number; deliveryDate: string | null }) {
  const router = useRouter();
  const { pending, run } = useRun();
  const [open, setOpen] = useState<"menu" | "copy" | "date" | null>(null);
  const [disc, setDisc] = useState({ kind: "percent" as "percent" | "amount", value: "" });
  const [date, setDate] = useState(deliveryDate ?? "");
  return (
    <>
      <Button icon={<Pencil className="size-4" />} onClick={() => router.push(`/orders/${orderId}/edit`)}>Изменить</Button>
      <Button icon={<CalendarClock className="size-4" />} onClick={() => setOpen("date")}>Перенести</Button>
      <Button variant="ghost" size="icon" aria-label="Ещё действия" onClick={() => setOpen("menu")}><MoreHorizontal className="size-5" /></Button>
      <Modal open={open === "menu"} onClose={() => setOpen(null)} title={`Заявка №${number}`} size="sm">
        <div className="flex flex-col gap-2">
          <Button className="justify-start" icon={<Copy className="size-4" />} onClick={() => setOpen("copy")}>Копировать (можно со скидкой)</Button>
          <Button className="justify-start text-danger" variant="ghost" icon={<Trash2 className="size-4" />} loading={pending}
            onClick={() => confirm(`Удалить заявку №${number}? Начисления будут аннулированы.`) && run(() => deleteOrderAction({ id: orderId }), { success: "Заявка удалена", onOk: () => router.replace("/orders") })}>Удалить заявку</Button>
        </div>
      </Modal>
      <Modal open={open === "copy"} onClose={() => setOpen(null)} title="Копия заявки" size="sm"
        footer={<><Button onClick={() => setOpen(null)}>Отмена</Button><Button variant="primary" loading={pending}
          onClick={() => run(() => copyOrderAction({ id: orderId, discount: Number(disc.value) > 0 ? { kind: disc.kind, value: disc.kind === "amount" ? Math.round(Number(disc.value.replace(",", ".")) * 100) : Number(disc.value.replace(",", ".")) } : undefined }), { success: "Создана копия", onOk: (id) => router.push(`/orders/${id}`) })}>Создать копию</Button></>}>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-2">Новая заявка со статусом «Новый». Начисления по ней посчитаются заново.</p>
          <div className="grid grid-cols-[1fr_120px] gap-2">
            <Field label="Скидка (необязательно)"><Input inputMode="decimal" value={disc.value} onChange={(e) => setDisc({ ...disc, value: e.target.value })} placeholder="0" /></Field>
            <Field label="&nbsp;"><Select value={disc.kind} onChange={(e) => setDisc({ ...disc, kind: e.target.value as "percent" })}><option value="percent">%</option><option value="amount">₸</option></Select></Field>
          </div>
        </div>
      </Modal>
      <Modal open={open === "date"} onClose={() => setOpen(null)} title="Перенос доставки" size="sm"
        footer={<><Button onClick={() => setOpen(null)}>Отмена</Button><Button variant="primary" loading={pending} onClick={() => run(() => rescheduleAction({ id: orderId, date: date || null }), { success: "Дата доставки изменена", onOk: () => setOpen(null) })}>Сохранить</Button></>}>
        <Field label="Новая дата"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus /></Field>
      </Modal>
    </>
  );
}
