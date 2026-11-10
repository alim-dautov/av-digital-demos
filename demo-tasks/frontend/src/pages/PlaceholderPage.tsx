import { useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { BottomSheet, Button, Card, EmptyState } from '../components/ui'
import { enqueueOutbox } from '../lib/outbox'

type Props = {
  title: string
  resourceLabel: string
  stage: string
}

export function PlaceholderPage({ title, resourceLabel, stage }: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [note, setNote] = useState('')

  return (
    <AppShell title={title} onCreateTask={() => setCreateOpen(true)}>
      <Card>
        <EmptyState
          title={`${resourceLabel} появится в ${stage}`}
          description="Сейчас доступны вход, роли, оболочка и офлайн-очередь. Рабочие данные без выдуманных цифр."
        />
      </Card>
      <BottomSheet open={createOpen} title="Создать задачу" persistent onClose={() => setCreateOpen(false)}>
        <p className="mb-3 text-sm text-muted">
          Полное создание задач — в Этапе 1. Можно положить черновик в офлайн-очередь.
        </p>
        <textarea
          className="min-h-28 w-full rounded-[9px] border border-border bg-bg p-3 text-base md:text-sm"
          placeholder="Черновик комментария / заметки…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            onClick={async () => {
              await enqueueOutbox('draft_comment', { text: note || 'Черновик' })
              setNote('')
              setCreateOpen(false)
            }}
          >
            В очередь
          </Button>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Отмена
          </Button>
        </div>
      </BottomSheet>
    </AppShell>
  )
}
