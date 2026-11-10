import clsx from 'clsx'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mergeOrder, saveSidebarOrder, useSidebarOrder } from '../../lib/sidebarNav'
import { Button, Card } from '../ui'

/** Put the reordered visible keys back into the slots visible items held; hidden items keep their place. */
function withHidden(full: string[], visibleSet: Set<string>, visible: string[]): string[] {
  let i = 0
  return full.map((k) => (visibleSet.has(k) ? visible[i++] : k))
}

export function SidebarOrderCard() {
  const { can } = useAuth()
  const saved = useSidebarOrder()
  const full = useMemo(() => mergeOrder(saved).map((i) => i.key), [saved])
  const items = useMemo(() => mergeOrder(saved).filter((i) => !i.resource || can(i.resource)), [saved, can])
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.key))
  const [drag, setDrag] = useState<number | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => setOrder(items.map((i) => i.key)), [items])

  const byKey = new Map(items.map((i) => [i.key, i]))
  const dirty = order.join() !== items.map((i) => i.key).join()

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    setOrder((prev) => {
      const next = [...prev]
      const [k] = next.splice(from, 1)
      next.splice(to, 0, k)
      return next
    })
    setStatus(null)
  }

  const run = async (value: string[] | null, done: string) => {
    setBusy(true)
    setStatus(null)
    try {
      await saveSidebarOrder(value)
      setStatus(done)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <h2 className="font-semibold">Боковое меню</h2>
      <p className="mt-1 text-sm text-muted">Перетащите пункты или используйте стрелки, затем нажмите «Сохранить».</p>
      <ol className="mt-4 grid gap-1.5" aria-label="Порядок пунктов меню">
        {order.map((key, idx) => {
          const item = byKey.get(key)
          if (!item) return null
          const Icon = item.icon
          return (
            <li
              key={key}
              draggable
              onDragStart={(e) => {
                setDrag(idx)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (drag !== null && drag !== idx) {
                  move(drag, idx)
                  setDrag(idx)
                }
              }}
              onDragEnd={() => setDrag(null)}
              className={clsx(
                'flex min-h-11 items-center gap-2 rounded-[9px] border border-border bg-panel px-2 text-sm',
                drag === idx && 'border-accent opacity-70',
              )}
            >
              <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted" aria-hidden />
              <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-[8px] text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
                onClick={() => move(idx, idx - 1)}
                disabled={idx === 0}
                aria-label={`Поднять «${item.label}»`}
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-[8px] text-muted hover:bg-panel-2 hover:text-text disabled:opacity-30"
                onClick={() => move(idx, idx + 1)}
                disabled={idx === order.length - 1}
                aria-label={`Опустить «${item.label}»`}
              >
                <ArrowDown className="h-4 w-4" aria-hidden />
              </button>
            </li>
          )
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled={busy || !dirty} onClick={() => void run(withHidden(full, new Set(order), order), 'Сохранено')}>
          Сохранить
        </Button>
        <Button variant="outline" disabled={busy || saved === null} onClick={() => void run(null, 'Порядок по умолчанию')}>
          Сбросить по умолчанию
        </Button>
        {status ? <span className="text-sm text-muted">{status}</span> : null}
      </div>
    </Card>
  )
}
