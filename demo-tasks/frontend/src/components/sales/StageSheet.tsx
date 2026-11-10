import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { fromInputDateTime } from '../../lib/tasks'
import { BottomSheet, Button, Input, Textarea } from '../ui'
import type { Deal } from './DealBoard'

export type PendingMove = { deal: Deal; to: string; toName: string; error: string }

type FieldDef = { key: string; label: string; type: 'text' | 'textarea' | 'datetime' | 'checkbox' }

const STAGE_FIELDS: Record<string, FieldDef[]> = {
  contact_made: [{ key: 'client_replied', label: 'Клиент ответил', type: 'checkbox' }],
  need_defined: [
    { key: 'client_task', label: 'Задача клиента', type: 'textarea' },
    { key: 'product', label: 'Товар', type: 'text' },
    { key: 'requirements', label: 'Требования', type: 'textarea' },
  ],
  proposal_sent: [{ key: 'manual_quote_sent', label: 'Предложение отправлено клиенту', type: 'checkbox' }],
  negotiation: [
    { key: 'objection', label: 'Возражение или вопрос', type: 'textarea' },
    { key: 'next_contact_at', label: 'Следующий контакт', type: 'datetime' },
  ],
  awaiting_payment: [{ key: 'payment_terms', label: 'Условия оплаты', type: 'text' }],
  lost: [{ key: 'loss_reason', label: 'Причина отказа', type: 'textarea' }],
}

const STAGE_HINT: Record<string, string> = {
  proposal_sent: 'Товары и цены добавляются в карточке сделки.',
  awaiting_payment: 'Заказ создаётся в карточке сделки.',
  won: 'Нужна полная оплата, подтверждённая 1С или вручную уполномоченным сотрудником.',
}

export function StageSheet({
  pending,
  onClose,
  onMoved,
  onOpenDeal,
}: {
  pending: PendingMove | null
  onClose: () => void
  onMoved: (move: PendingMove) => void
  onOpenDeal: (id: number) => void
}) {
  return (
    <BottomSheet open={pending !== null} title={pending ? `Перенос в «${pending.toName}»` : 'Перенос сделки'} onClose={onClose}>
      {pending ? <StageForm key={`${pending.deal.id}-${pending.to}`} pending={pending} onMoved={onMoved} onOpenDeal={onOpenDeal} /> : null}
    </BottomSheet>
  )
}

function StageForm({ pending, onMoved, onOpenDeal }: { pending: PendingMove; onMoved: (move: PendingMove) => void; onOpenDeal: (id: number) => void }) {
  const fields = STAGE_FIELDS[pending.to] || []
  const hint = STAGE_HINT[pending.to]
  const [values, setValues] = useState<Record<string, string | boolean>>({})
  const [error, setError] = useState(pending.error)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const body: Record<string, unknown> = { stage: pending.to }
    for (const f of fields) {
      const value = values[f.key]
      if (f.type === 'checkbox') body[f.key] = Boolean(value)
      else if (typeof value === 'string' && value.trim()) body[f.key] = f.type === 'datetime' ? fromInputDateTime(value) : value.trim()
    }
    try {
      await api(`/deals/${pending.deal.id}/move`, { method: 'POST', body: JSON.stringify(body) })
      onMoved(pending)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось перенести сделку')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-4 text-sm" onSubmit={onSubmit}>
      <div>
        <p className="font-medium">{pending.deal.title}</p>
        <p className="text-muted">
          {pending.deal.number} · {pending.deal.client_name}
        </p>
      </div>
      <p className="rounded-[9px] bg-danger/10 px-3 py-2 text-danger" role="alert">
        {error}
      </p>
      {fields.map((f) =>
        f.type === 'checkbox' ? (
          <label key={f.key} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-accent)]"
              checked={Boolean(values[f.key])}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
            />
            {f.label}
          </label>
        ) : (
          <label key={f.key} className="grid gap-1 text-muted">
            {f.label}
            {f.type === 'textarea' ? (
              <Textarea className="min-h-20" value={String(values[f.key] ?? '')} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            ) : (
              <Input
                type={f.type === 'datetime' ? 'datetime-local' : 'text'}
                value={String(values[f.key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            )}
          </label>
        ),
      )}
      {hint ? <p className="text-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {fields.length > 0 ? (
          <Button type="submit" className="flex-1" disabled={busy}>
            {busy ? 'Переносим…' : 'Перенести'}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenDeal(pending.deal.id)}>
          Открыть сделку
        </Button>
      </div>
    </form>
  )
}
