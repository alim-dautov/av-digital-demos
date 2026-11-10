"use client";
import { useState } from "react";
import { Eraser } from "lucide-react";
import { Button, Checkbox, Field, Input, Modal } from "@/components/ui";
import { useRun } from "@/components/use-run";
import { bulkDeleteDraftsAction } from "@/modules/orders/actions";

/** Массовое удаление старых заявок-черновиков: сначала проверка, затем удаление */
export function BulkDrafts({ statuses }: { statuses: { id: number; name: string; code: string }[] }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(30);
  const [ids, setIds] = useState<number[]>(statuses.filter((s) => s.code === "new" || s.code === "price").map((s) => s.id));
  const [found, setFound] = useState<{ count: number; numbers: number[] } | null>(null);
  const { pending, run } = useRun();
  return (
    <>
      <Button variant="ghost" icon={<Eraser className="size-4" />} onClick={() => { setOpen(true); setFound(null); }}>Чистка черновиков</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Удалить старые черновики" size="sm"
        footer={<><Button onClick={() => setOpen(false)}>Отмена</Button>
          {!found ? <Button variant="primary" loading={pending} onClick={() => run(() => bulkDeleteDraftsAction({ olderThanDays: days, statusIds: ids, dryRun: true }), { refresh: false, onOk: setFound })}>Найти</Button>
            : <Button variant="danger" loading={pending} disabled={!found.count} onClick={() => run(() => bulkDeleteDraftsAction({ olderThanDays: days, statusIds: ids, dryRun: false }), { success: (r) => `Удалено заявок: ${r.count}`, onOk: () => setOpen(false) })}>Удалить {found.count}</Button>}</>}>
        <div className="flex flex-col gap-4">
          <Field label="Старше, дней"><Input type="number" min={0} value={days} onChange={(e) => { setDays(Number(e.target.value) || 0); setFound(null); }} /></Field>
          <Field label="В статусах">
            <div className="flex flex-col">{statuses.map((s) => <Checkbox key={s.id} label={s.name} checked={ids.includes(s.id)} onChange={(v) => { setIds(v ? [...ids, s.id] : ids.filter((x) => x !== s.id)); setFound(null); }} />)}</div>
          </Field>
          <p className="text-xs text-ink-3">Заявки с отгрузками или оплатами не удаляются. Удалённые остаются в журнале действий.</p>
          {found && <p className="rounded-xl bg-surface-2 p-3 text-sm">{found.count ? <>Найдено: <b>{found.count}</b> — №{found.numbers.slice(0, 20).join(", №")}{found.numbers.length > 20 ? "…" : ""}</> : "Подходящих заявок нет"}</p>}
        </div>
      </Modal>
    </>
  );
}
