import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Flag, MessageSquare, Paperclip, Trash2 } from 'lucide-react'
import { BOARD_COLUMNS, PRIORITY_LABEL, assigneeLabel, isUrgent, taskAssignees, urgentFirst, type Task } from '../lib/tasks'
import { UrgentBadge } from './tasks/UrgentToggle'
import { MENTION_HIGHLIGHT, MentionMark, UnseenMark } from './tasks/UnseenMark'
import { BottomSheet, Button } from './ui'

const DELETE_DROP_ID = 'task-delete'

const preferDeleteZone: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args)
  const deleteHit = pointerHits.find((hit) => hit.id === DELETE_DROP_ID)
  if (deleteHit) return [deleteHit]
  const rectHits = rectIntersection(args)
  return rectHits.length > 0 ? rectHits : pointerHits
}

function Column({
  id,
  label,
  count,
  children,
  onAdd,
  collapsed,
  onToggle,
}: {
  id: string
  label: string
  count: number
  children: ReactNode
  onAdd?: () => void
  collapsed?: boolean
  onToggle?: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={onToggle}
        aria-label={`Показать колонку «${label}»`}
        className={clsx(
          'flex w-14 shrink-0 flex-col items-center gap-3 rounded-[14px] border bg-panel py-3 text-muted hover:text-text',
          isOver ? 'border-accent' : 'border-border',
        )}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
        <span className="tabular text-xs">{count}</span>
        <span className="text-sm font-semibold [writing-mode:vertical-rl]">{label}</span>
      </button>
    )
  }
  return (
    <div
      ref={setNodeRef}
      data-column={id}
      className={clsx(
        'w-[min(280px,85vw)] shrink-0 snap-start rounded-[14px] border p-3 transition-colors duration-200',
        isOver ? 'border-accent/70 bg-accent/5' : 'border-border bg-panel',
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">
          {label} <span className="tabular text-muted">{count}</span>
        </div>
        {onToggle ? (
          <button type="button" className="flex min-h-11 min-w-11 items-center justify-center text-muted" aria-label={`Свернуть «${label}»`} onClick={onToggle}>
            <ChevronLeft className="h-4 w-4" />
          </button>
        ) : onAdd ? (
          <button type="button" className="min-h-11 min-w-11 text-muted" aria-label={`Добавить в «${label}»`} onClick={onAdd}>
            +
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

function cardClass(task: Task) {
  return clsx(
    'relative rounded-[12px] border p-3 text-left',
    isUrgent(task)
      ? 'border-[#7f1d1d] bg-[#dc2626] text-white [&_.text-danger]:text-white [&_.text-muted]:text-white/90'
      : task.unread_mentions
        ? MENTION_HIGHLIGHT
        : clsx('bg-bg', task.is_overdue ? 'border-danger' : 'border-border'),
  )
}

function Card({ task, onOpen, dropped }: { task: Task; onOpen: (id: number) => void; dropped: boolean }) {
  const locked = task.status === 'done' || task.status === 'cancelled'
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: String(task.id), disabled: locked })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={task.title}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !isDragging) {
          e.preventDefault()
          onOpen(task.id)
          return
        }
        listeners?.onKeyDown?.(e)
      }}
      className={clsx(
        cardClass(task),
        'touch-manipulation transition-[border-color,opacity] duration-200 select-none [-webkit-touch-callout:none] focus-visible:border-accent focus-visible:outline-none',
        locked ? 'cursor-pointer' : 'cursor-grab',
        !task.is_overdue && !isUrgent(task) && 'hover:border-muted/50',
        isUrgent(task) && 'hover:border-white/80',
        isDragging && 'border-dashed opacity-40',
        dropped && 'card-drop',
      )}
    >
      <CardBody task={task} />
    </div>
  )
}

function CardBody({ task }: { task: Task }) {
  return (
    <>
      <div className="flex items-center gap-2 text-sm font-medium">
        <UnseenMark unseen={task.unseen} />
        <MentionMark count={task.unread_mentions} />
        {isUrgent(task) ? <UrgentBadge /> : null}
        <span className="min-w-0">{task.title}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <Flag className="h-3 w-3" />
          {PRIORITY_LABEL[task.priority]}
        </span>
        <span className={clsx(task.is_overdue && 'text-danger')}>{task.due_label}</span>
      </div>
      {task.status === 'cancelled' && task.cancel_reason ? (
        <div className="mt-2 rounded-[8px] bg-panel-2 px-2 py-1 text-xs text-muted">{task.cancel_reason}</div>
      ) : null}
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="flex shrink-0 -space-x-1">
            {taskAssignees(task).slice(0, 3).map((person) => (
              <span key={person.id} title={person.name} className="flex h-6 w-6 items-center justify-center rounded-full border border-bg bg-panel-2 text-[10px]">
                {person.initials}
              </span>
            ))}
          </span>
          <span className="truncate">{assigneeLabel(task)}</span>
        </span>
        <span className="inline-flex gap-2">
          {task.attachments_count > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="h-3 w-3" />
              {task.attachments_count}
            </span>
          ) : null}
          {task.comments_count > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="h-3 w-3" />
              {task.comments_count}
            </span>
          ) : null}
        </span>
      </div>
    </>
  )
}

function DeleteDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: DELETE_DROP_ID })
  return createPortal(
    <div
      ref={setNodeRef}
      data-delete-dropzone={isOver ? 'over' : 'idle'}
      className={clsx(
        'fixed inset-x-0 bottom-0 z-[65] flex min-h-20 items-center justify-center gap-3 border-t-2 px-4 pt-4 text-sm font-medium transition-colors duration-150',
        'pb-[max(1rem,var(--safe-bottom))]',
        isOver
          ? 'border-danger-hover bg-danger-hover text-white'
          : 'border-danger bg-danger/20 text-danger hover:border-danger-hover hover:bg-danger-hover hover:text-white',
      )}
    >
      <Trash2 className="h-5 w-5 shrink-0" aria-hidden />
      <span>Перетащите сюда, чтобы удалить</span>
    </div>,
    document.body,
  )
}

function DeleteTaskDialog({
  task,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  task: Task | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <BottomSheet open={task !== null} title="Удалить задачу" onClose={() => !busy && onCancel()}>
      {task ? (
        <div className="grid gap-4">
          <p className="text-sm leading-relaxed">Удалить задачу „{task.title}“? Это действие нельзя отменить.</p>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={busy}>
              Отмена
            </Button>
            <Button type="button" variant="danger" className="flex-1" onClick={onConfirm} disabled={busy}>
              {busy ? 'Удаляем…' : 'Удалить'}
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  )
}

const DROP_ANIMATION: DropAnimation = {
  duration: 200,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
}

export function TaskBoard({
  items,
  onOpen,
  onMove,
  onAdd,
  onDraggingChange,
  canDelete = false,
  onDelete,
}: {
  items: Task[]
  onOpen: (id: number) => void
  onMove: (task: Task, status: string) => void
  onAdd: () => void
  onDraggingChange?: (dragging: boolean) => void
  canDelete?: boolean
  onDelete?: (task: Task) => Promise<void>
}) {
  const [showCancelled, setShowCancelled] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)
  const [overStatus, setOverStatus] = useState<string | null>(null)
  const [droppedId, setDroppedId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const allowDelete = canDelete && Boolean(onDelete)
  const dropTimer = useRef<number | undefined>(undefined)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] } }),
  )
  const activeTask = activeId ? items.find((t) => t.id === activeId) : undefined
  const movesColumn = Boolean(
    activeTask && overStatus && overStatus !== DELETE_DROP_ID && overStatus !== activeTask.status,
  )

  useEffect(() => () => window.clearTimeout(dropTimer.current), [])

  function onDragStart(event: DragStartEvent) {
    setActiveId(Number(event.active.id))
    onDraggingChange?.(true)
    if (event.activatorEvent.type.startsWith('touch')) navigator.vibrate?.(10)
  }

  function reset() {
    setActiveId(null)
    setOverStatus(null)
    onDraggingChange?.(false)
  }

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over ? String(event.over.id) : ''
    const id = Number(event.active.id)
    reset()
    if (!overId || !id) return
    const current = items.find((t) => t.id === id)
    if (!current) return
    if (overId === DELETE_DROP_ID) {
      if (allowDelete) {
        setDeleteError(null)
        setPendingDelete(current)
      }
      return
    }
    if (current.status === overId) return
    window.clearTimeout(dropTimer.current)
    setDroppedId(id)
    dropTimer.current = window.setTimeout(() => setDroppedId(null), 400)
    onMove(current, overId)
  }

  async function confirmDelete() {
    if (!pendingDelete || !onDelete || deleting) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await onDelete(pendingDelete)
      setPendingDelete(null)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Не удалось удалить задачу')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
    <DndContext
      sensors={sensors}
      collisionDetection={preferDeleteZone}
      autoScroll={{ threshold: { x: 0.1, y: 0 } }}
      onDragStart={onDragStart}
      onDragOver={(e) => setOverStatus(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={reset}
    >
      <div
        className={clsx(
          '-mx-4 flex scroll-px-4 gap-3 overflow-x-auto px-4 md:mx-0 md:scroll-px-0 md:px-0',
          allowDelete && activeId ? 'pb-24' : 'pb-4',
          activeId ? 'snap-none' : 'snap-x snap-mandatory',
        )}
      >
        {BOARD_COLUMNS.map((col) => {
          const cards = urgentFirst(items.filter((t) => t.status === col.key))
          const isCancelled = col.key === 'cancelled'
          return (
            <Column
              key={col.key}
              id={col.key}
              label={col.label}
              count={cards.length}
              onAdd={col.key === 'new' ? onAdd : undefined}
              collapsed={isCancelled && !showCancelled}
              onToggle={isCancelled ? () => setShowCancelled((v) => !v) : undefined}
            >
              {cards.map((task) => (
                <Card key={task.id} task={task} onOpen={onOpen} dropped={droppedId === task.id} />
              ))}
              {col.key === 'new' ? (
                <button type="button" className="min-h-11 rounded-[9px] text-xs text-muted hover:text-accent" onClick={onAdd}>
                  + Добавить задачу
                </button>
              ) : null}
              {cards.length === 0 && col.key !== 'new' ? <p className="py-4 text-center text-xs text-muted">Пусто</p> : null}
            </Column>
          )
        })}
      </div>
      {allowDelete && activeId ? <DeleteDropZone /> : null}
      <DragOverlay dropAnimation={movesColumn ? null : DROP_ANIMATION}>
        {activeTask ? (
          <div className={clsx(cardClass(activeTask), 'card-lift cursor-grabbing shadow-2xl shadow-black/50')}>
            <CardBody task={activeTask} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
    <DeleteTaskDialog
      task={pendingDelete}
      busy={deleting}
      error={deleteError}
      onCancel={() => {
        if (deleting) return
        setPendingDelete(null)
        setDeleteError(null)
      }}
      onConfirm={() => void confirmDelete()}
    />
    </>
  )
}
