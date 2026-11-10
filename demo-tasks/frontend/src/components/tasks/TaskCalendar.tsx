import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { STATUS_TONE, WEEKDAY_SHORT, isUrgent, localDateKey, taskAssignees, type Task } from '../../lib/tasks'
import { UrgentBadge } from './UrgentToggle'
import { UnseenMark } from './UnseenMark'
import { MQ_MD, useMediaQuery } from '../../lib/useMediaQuery'
import { Button, Card } from '../ui'

export type CalendarMode = 'month' | 'week'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']

function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function calendarRange(anchor: Date, mode: CalendarMode): Date[] {
  const start = mode === 'week' ? mondayOf(anchor) : mondayOf(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
  const count = mode === 'week' ? 7 : 42
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
}

export function shiftAnchor(anchor: Date, mode: CalendarMode, dir: number): Date {
  return mode === 'week'
    ? new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + dir * 7)
    : new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1)
}

function Chip({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const locked = task.status === 'done' || task.status === 'cancelled'
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: String(task.id), disabled: locked })
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 30 : undefined }}
      className={clsx(
        'relative flex min-h-7 w-full items-center gap-1.5 truncate rounded-[6px] border px-1.5 text-left text-xs select-none',
        isUrgent(task)
          ? 'border-[#7f1d1d] bg-[#dc2626] text-white [&_.text-muted]:text-white/90'
          : task.unread_mentions
            ? 'border-accent/70 bg-accent/10'
            : clsx('bg-bg', task.is_overdue ? 'border-danger/60' : 'border-border'),
        locked ? 'opacity-60' : 'cursor-grab',
        isDragging && 'shadow-lg',
      )}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task.id)}
      title={task.title}
    >
      {task.unseen ? <UnseenMark unseen /> : null}
      {task.unread_mentions ? <span className="shrink-0 font-semibold text-accent" title="Вас упомянули">@</span> : null}
      {isUrgent(task) ? <UrgentBadge className="px-1 py-0" /> : null}
      <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full bg-current', !isUrgent(task) && STATUS_TONE[task.status])} />
      <span className="tabular shrink-0 text-muted">{task.due_at?.slice(11, 16)}</span>
      <span className={clsx('truncate', task.status === 'done' && 'line-through')}>{task.title}</span>
    </button>
  )
}

function Day({
  date,
  tasks,
  outside,
  today,
  tall,
  onOpen,
  onCreate,
}: {
  date: Date
  tasks: Task[]
  outside: boolean
  today: boolean
  tall: boolean
  onOpen: (id: number) => void
  onCreate: (dateKey: string) => void
}) {
  const key = localDateKey(date)
  const { setNodeRef, isOver } = useDroppable({ id: key })
  const visible = tall ? tasks : tasks.slice(0, 3)
  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'group flex flex-col gap-1 border-t border-l border-border p-1.5',
        tall ? 'min-h-72' : 'min-h-28',
        outside && 'bg-bg/40 text-muted',
        isOver && 'bg-accent-soft',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={clsx(
            'tabular flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs',
            today && 'bg-accent font-semibold text-white',
          )}
        >
          {date.getDate()}
        </span>
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-muted opacity-0 group-hover:opacity-100 hover:text-accent focus:opacity-100 pointer-coarse:opacity-100"
          aria-label={`Создать задачу на ${key}`}
          onClick={() => onCreate(key)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {visible.map((t) => (
        <Chip key={t.id} task={t} onOpen={onOpen} />
      ))}
      {tasks.length > visible.length ? <span className="px-1 text-[11px] text-muted">ещё {tasks.length - visible.length}</span> : null}
    </div>
  )
}

const WEEKDAY_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

function Agenda({
  days,
  byDay,
  todayKey,
  showEmpty,
  onOpen,
  onCreate,
}: {
  days: Date[]
  byDay: Map<string, Task[]>
  todayKey: string
  showEmpty: boolean
  onOpen: (id: number) => void
  onCreate: (dateKey: string) => void
}) {
  const visible = days.filter((d) => {
    const key = localDateKey(d)
    return showEmpty || key === todayKey || (byDay.get(key)?.length ?? 0) > 0
  })
  if (visible.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted">В этом месяце задач со сроком нет</Card>
  }
  return (
    <div className="grid grid-cols-1 gap-3">
      {visible.map((date) => {
        const key = localDateKey(date)
        const tasks = byDay.get(key) || []
        return (
          <section key={key} className="rounded-[14px] border border-border bg-panel" aria-label={`${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`}>
            <header className="flex items-center justify-between gap-2 border-b border-border py-1 pr-1 pl-3">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={clsx(
                    'tabular flex h-7 min-w-7 items-center justify-center rounded-full px-1 font-semibold',
                    key === todayKey && 'bg-accent text-white',
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="text-muted">
                  {MONTHS_GENITIVE[date.getMonth()]} · {WEEKDAY_LONG[date.getDay()].toLowerCase()}
                </span>
              </div>
              <button
                type="button"
                className="flex min-h-11 min-w-11 items-center justify-center text-muted hover:text-accent"
                aria-label={`Создать задачу на ${key}`}
                onClick={() => onCreate(key)}
              >
                <Plus className="h-4 w-4" />
              </button>
            </header>
            {tasks.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">Задач нет</p>
            ) : (
              <ul>
                {tasks.map((t) => (
                  <li key={t.id} className="border-t border-border first:border-t-0">
                    <button
                      type="button"
                      className={clsx(
                        'flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm',
                        isUrgent(t) && 'bg-[#dc2626] text-white [&_.text-muted]:text-white/90',
                      )}
                      onClick={() => onOpen(t.id)}
                    >
                      <span className={clsx('h-2 w-2 shrink-0 rounded-full bg-current', !isUrgent(t) && STATUS_TONE[t.status])} />
                      {isUrgent(t) ? <UrgentBadge /> : null}
                      <span className={clsx('tabular shrink-0 text-xs', isUrgent(t) ? 'text-white/90' : 'text-muted')}>{t.due_at?.slice(11, 16)}</span>
                      <span className={clsx('min-w-0 flex-1 truncate', t.status === 'done' && 'line-through', t.status === 'done' && !isUrgent(t) && 'text-muted', t.is_overdue && !isUrgent(t) && 'text-danger')}>
                        {t.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted">{taskAssignees(t).map((person) => person.initials).join(' ')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}

export function TaskCalendar({
  items,
  anchor,
  mode,
  onAnchor,
  onMode,
  onOpen,
  onMoveDue,
  onCreate,
}: {
  items: Task[]
  anchor: Date
  mode: CalendarMode
  onAnchor: (d: Date) => void
  onMode: (m: CalendarMode) => void
  onOpen: (id: number) => void
  onMoveDue: (task: Task, dueAt: string) => void
  onCreate: (dateKey: string) => void
}) {
  const grid = useMediaQuery(MQ_MD)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )
  const days = useMemo(() => calendarRange(anchor, mode), [anchor, mode])
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of items) {
      if (!t.due_at) continue
      const key = t.due_at.slice(0, 10)
      map.set(key, [...(map.get(key) || []), t])
    }
    for (const list of map.values()) {
      list.sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a)) || (a.due_at || '').localeCompare(b.due_at || ''))
    }
    return map
  }, [items])
  const todayKey = localDateKey(new Date())

  function onDragEnd(event: DragEndEvent) {
    const day = event.over ? String(event.over.id) : ''
    const task = items.find((t) => String(t.id) === String(event.active.id))
    if (!day || !task || task.due_at?.slice(0, 10) === day) return
    onMoveDue(task, `${day} ${task.due_at?.slice(11) || '18:00:00'}`)
  }

  const title =
    mode === 'month'
      ? `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
      : `${days[0].getDate()}.${String(days[0].getMonth() + 1).padStart(2, '0')} — ${days[6].getDate()}.${String(days[6].getMonth() + 1).padStart(2, '0')}.${days[6].getFullYear()}`

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="w-full text-base font-semibold sm:order-last sm:w-auto sm:flex-1">{title}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" className="shrink-0 px-0" aria-label="Назад" onClick={() => onAnchor(shiftAnchor(anchor, mode, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="shrink-0 px-3 sm:px-4" onClick={() => onAnchor(new Date())}>
            Сегодня
          </Button>
          <Button variant="outline" className="shrink-0 px-0" aria-label="Вперёд" onClick={() => onAnchor(shiftAnchor(anchor, mode, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid min-w-0 flex-1 grid-cols-2 rounded-[9px] border border-border p-1 sm:order-last sm:flex sm:flex-none">
          {(
            [
              ['month', 'Месяц'],
              ['week', 'Неделя'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={clsx('min-h-9 rounded-[7px] px-1 text-[13px] sm:px-3 sm:text-sm', mode === key ? 'bg-panel-2 text-accent' : 'text-muted')}
              onClick={() => onMode(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!grid ? (
        <Agenda
          days={mode === 'month' ? days.filter((d) => d.getMonth() === anchor.getMonth()) : days}
          byDay={byDay}
          todayKey={todayKey}
          showEmpty={mode === 'week'}
          onOpen={onOpen}
          onCreate={onCreate}
        />
      ) : (
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-x-auto rounded-[14px] border border-border bg-panel">
          <div className="grid min-w-[720px] grid-cols-7 border-r border-b border-border">
            {WEEKDAY_SHORT.map((d) => (
              <div key={d} className="border-l border-border px-2 py-2 text-[11px] font-semibold text-muted">
                {d}
              </div>
            ))}
            {days.map((date) => {
              const key = localDateKey(date)
              return (
                <Day
                  key={key}
                  date={date}
                  tasks={byDay.get(key) || []}
                  outside={mode === 'month' && date.getMonth() !== anchor.getMonth()}
                  today={key === todayKey}
                  tall={mode === 'week'}
                  onOpen={onOpen}
                  onCreate={onCreate}
                />
              )
            })}
          </div>
        </div>
      </DndContext>
      )}
      <p className="text-center text-xs text-muted">
        {grid ? 'Перетащите задачу на другой день, чтобы перенести срок' : 'Чтобы перенести срок, откройте задачу'}
      </p>
    </div>
  )
}
