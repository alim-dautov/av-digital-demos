import { useEffect, useState } from 'react'
import { BottomSheet, Button, Field, Textarea } from '../ui'

export type ReasonKind = 'cancel' | 'return'

export type ReasonPayload = {
  status: string
  cancel_reason?: string
  comment?: string
}

const COPY: Record<ReasonKind, { title: string; label: string; submit: string; status: string }> = {
  cancel: { title: 'Отменить задачу', label: 'Причина отмены', submit: 'Отменить задачу', status: 'cancelled' },
  return: { title: 'Вернуть на доработку', label: 'Что нужно исправить', submit: 'Вернуть', status: 'in_progress' },
}

export function ReasonDialog({
  kind,
  onClose,
  onSubmit,
}: {
  kind: ReasonKind | null
  onClose: () => void
  onSubmit: (payload: ReasonPayload) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText('')
    setError(null)
  }, [kind])

  if (!kind) return null
  const copy = COPY[kind]
  const valid = text.trim() !== ''

  return (
    <BottomSheet open title={copy.title} persistent onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return
          setBusy(true)
          setError(null)
          const payload: ReasonPayload = { status: copy.status }
          if (kind === 'cancel') {
            payload.cancel_reason = text.trim()
          } else {
            payload.comment = text.trim()
          }
          try {
            await onSubmit(payload)
            onClose()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Не удалось сохранить')
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label={copy.label}>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} required autoFocus />
        </Field>
        {kind === 'cancel' ? (
          <p className="text-xs text-muted">Отменённую задачу нельзя вернуть в работу.</p>
        ) : null}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" variant={kind === 'cancel' ? 'danger' : 'primary'} className="flex-1" disabled={!valid || busy}>
            {busy ? 'Сохраняем…' : copy.submit}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Назад
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}
