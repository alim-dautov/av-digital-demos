import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { formatKzt } from '../../lib/format'
import { sourceLabel } from '../../lib/sources'
import { SourceIcon } from '../SourceIcon'

export type Deal = {
  id: number
  number: string
  title: string
  client_name: string
  amount: number
  owner_initials: string
  owner_name: string
  next_contact_at: string | null
  idle_hours: number | null
  channel: string
  source: string
}

export type DealColumn = { slug: string; name: string; count: number; amount: number; deals: Deal[] }

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
}

function Column({ column, children }: { column: DealColumn; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.slug })
  return (
    <section
      ref={setNodeRef}
      className={clsx(
        'w-[min(280px,85vw)] shrink-0 snap-start rounded-[14px] border p-3 transition-colors duration-200',
        isOver ? 'border-accent/70 bg-accent/5' : 'border-border bg-panel',
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {column.name} <span className="tabular text-muted">{column.count}</span>
        </h2>
        <span className="tabular shrink-0 text-xs text-muted">{formatKzt(column.amount)}</span>
      </header>
      <div className="flex min-h-16 flex-col gap-2">
        {children}
        {column.deals.length === 0 ? <p className="py-4 text-center text-xs text-muted">Пусто</p> : null}
      </div>
    </section>
  )
}

function DealCard({ deal, onOpen, disabled }: { deal: Deal; onOpen: (id: number) => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(deal.id), disabled })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={deal.title}
      onClick={() => onOpen(deal.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isDragging) {
          e.preventDefault()
          onOpen(deal.id)
          return
        }
        listeners?.onKeyDown?.(e)
      }}
      className={clsx(
        'rounded-[12px] border border-border bg-bg p-3 text-left transition-[border-color,opacity] duration-200 select-none [-webkit-touch-callout:none] hover:border-accent/60 focus-visible:border-accent focus-visible:outline-none',
        'touch-manipulation',
        disabled ? 'cursor-pointer' : 'cursor-grab',
        isDragging && 'border-dashed opacity-40',
      )}
    >
      <DealBody deal={deal} />
    </div>
  )
}

function DealBody({ deal }: { deal: Deal }) {
  return (
    <>
      <div className="text-sm font-medium break-words">{deal.title}</div>
      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <SourceIcon source={deal.source} className="h-3.5 w-3.5" />
        <span className="truncate">
          {deal.client_name} · {sourceLabel(deal.source)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="tabular">{formatKzt(deal.amount)}</span>
        <span className="text-muted">{deal.owner_initials}</span>
      </div>
      {deal.idle_hours !== null && deal.idle_hours > 24 ? <div className="mt-2 text-xs text-danger">Без активности {deal.idle_hours} ч</div> : null}
    </>
  )
}

export function DealBoard({
  columns,
  canMove,
  onOpen,
  onMove,
}: {
  columns: DealColumn[]
  canMove: boolean
  onOpen: (id: number) => void
  onMove: (deal: Deal, from: string, to: string) => void
}) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const [overSlug, setOverSlug] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  )
  const activeColumn = activeId ? columns.find((c) => c.deals.some((d) => d.id === activeId)) : undefined
  const activeDeal = activeColumn?.deals.find((d) => d.id === activeId)
  const movesColumn = Boolean(activeColumn && overSlug && overSlug !== activeColumn.slug)

  function reset() {
    setActiveId(null)
    setOverSlug(null)
  }

  function onDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id))
    if (event.activatorEvent.type.startsWith('touch')) navigator.vibrate?.(10)
  }

  function onDragEnd(event: DragEndEvent) {
    reset()
    const to = event.over ? String(event.over.id) : ''
    const id = Number(event.active.id)
    const from = columns.find((c) => c.deals.some((d) => d.id === id))
    const deal = from?.deals.find((d) => d.id === id)
    if (!to || !from || !deal || from.slug === to) return
    onMove(deal, from.slug, to)
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={{ threshold: { x: 0.1, y: 0 } }}
      onDragStart={onDragStart}
      onDragOver={(e) => setOverSlug(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div
        className={clsx(
          '-mx-4 flex scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:scroll-px-0 md:px-0',
          activeId ? 'snap-none' : 'snap-x snap-mandatory',
        )}
      >
        {columns.map((col) => (
          <Column key={col.slug} column={col}>
            {col.deals.map((deal) => (
              <DealCard key={deal.id} deal={deal} onOpen={onOpen} disabled={!canMove} />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={movesColumn ? null : DROP_ANIMATION}>
        {activeDeal ? (
          <div className="card-lift cursor-grabbing rounded-[12px] border border-border bg-bg p-3 text-left shadow-2xl shadow-black/50">
            <DealBody deal={activeDeal} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
