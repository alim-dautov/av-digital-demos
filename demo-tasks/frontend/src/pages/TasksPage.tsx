import clsx from 'clsx'
import { AlarmClock, ClipboardCheck, Flag, LayoutGrid, MessageSquare, Paperclip, Repeat, Send, UserRound } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { TaskBoard } from '../components/TaskBoard'
import { AppShell } from '../components/layout/AppShell'
import { ReasonDialog, type ReasonKind, type ReasonPayload } from '../components/tasks/ReasonDialog'
import { TaskCalendar, calendarRange, type CalendarMode } from '../components/tasks/TaskCalendar'
import { TaskCard } from '../components/tasks/TaskCard'
import { TaskCreateForm } from '../components/tasks/TaskCreateForm'
import { FILTER_KEYS, TaskFilters } from '../components/tasks/TaskFilters'
import { TemplatesPanel } from '../components/tasks/TemplatesPanel'
import { BottomSheet, Button, Card, ErrorState, Spinner, Toast } from '../components/ui'
import { MentionMark, UnseenMark } from '../components/tasks/UnseenMark'
import { UrgentBadge } from '../components/tasks/UrgentToggle'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { TASK_SEEN_EVENT } from '../lib/unseenTasks'
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  assigneeLabel,
  isUrgent,
  urgentFirst,
  taskAssignees,
  localDateKey,
  transitionError,
  transitionNeedsDialog,
  type Task,
} from '../lib/tasks'

type TasksResponse = {
  items: Task[]
  counts: { mine: number; all: number; on_review: number; overdue: number }
}

type View = 'list' | 'board' | 'calendar' | 'templates'

const SCOPES = [
  ['mine', 'Мои', UserRound],
  ['created', 'Поставленные', Send],
  ['all', 'Все', LayoutGrid],
  ['on_review', 'На проверке', ClipboardCheck],
  ['overdue', 'Просроченные', AlarmClock],
] as const

const DEFAULT_VIEW: View = 'board'

// Hidden views stay reachable via ?view=list / ?view=calendar / ?view=templates.
const VIEWS: Array<[View, string, boolean]> = [
  ['list', 'Список', false],
  ['board', 'Доска', false],
  ['calendar', 'Календарь', false],
  ['templates', 'Шаблоны', false],
]
const VISIBLE_VIEWS = VIEWS.filter(([, , visible]) => visible)

const OPEN = ['new', 'in_progress', 'on_review']
const LIVE_POLL_MS = 4000

function parseDate(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d)
  }
  return new Date()
}

export function TasksPage() {
  const { user, can } = useAuth()
  const seeAll = user?.role === 'owner' || user?.see_all_tasks === true
  const [params, setParams] = useSearchParams()
  const scope = params.get('scope') || 'all'
  const view = (params.get('view') as View) || DEFAULT_VIEW
  const calMode = (params.get('cal') as CalendarMode) || 'month'
  const anchor = useMemo(() => parseDate(params.get('d')), [params])
  const openTaskId = Number(params.get('task')) || null

  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const location = useLocation()
  const [create, setCreate] = useState<{ due?: string; templateId?: number } | null>(() => {
    const templateId = (location.state as { templateId?: number } | null)?.templateId
    return templateId ? { templateId } : null
  })
  const [pending, setPending] = useState<{ task: Task; kind: ReasonKind; status: string } | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ cancelled: true })
  const toastTimer = useRef<number | undefined>(undefined)

  const showToast = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }, [])

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v) next.set(k, v)
            else next.delete(k)
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const queryKey = useMemo(() => {
    const qs = new URLSearchParams()
    if (scope !== 'all') qs.set('scope', scope)
    for (const key of FILTER_KEYS) {
      if (key === 'assignee_id' && !seeAll) continue
      const v = params.get(key)
      if (v) qs.set(key, v)
    }
    if (view === 'calendar') {
      const days = calendarRange(anchor, calMode)
      qs.set('from', localDateKey(days[0]))
      qs.set('to', localDateKey(days[days.length - 1]))
    }
    return qs.toString()
  }, [scope, params, view, anchor, calMode, seeAll])

  const requestSeq = useRef(0)
  const [dataScope, setDataScope] = useState(scope)
  const load = useCallback(
    async (quiet = false) => {
      const seq = ++requestSeq.current
      if (!quiet) setLoading(true)
      setError(null)
      try {
        const next = await api<TasksResponse>(`/tasks?${queryKey}`)
        if (seq === requestSeq.current) {
          setData(next)
          setDataScope(scope)
        }
      } catch (e) {
        if (seq === requestSeq.current) setError(e instanceof Error ? e.message : 'Ошибка загрузки')
      } finally {
        if (seq === requestSeq.current) setLoading(false)
      }
    },
    [queryKey, scope],
  )

  const tabsRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  const [indicatorReady, setIndicatorReady] = useState(false)
  useLayoutEffect(() => {
    const list = tabsRef.current
    const tab = list?.querySelector<HTMLElement>(`[data-scope="${scope}"]`)
    if (!list || !tab) return
    const measure = () => setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth })
    measure()
    const frame = requestAnimationFrame(() => setIndicatorReady(true))
    tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    observer.observe(tab)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [scope])

  useEffect(() => {
    if (view !== 'templates') void load()
  }, [load, view])

  useEffect(() => {
    const onSeen = (event: Event) => {
      const id = Number((event as CustomEvent<{ id?: number }>).detail?.id)
      if (!id) return
      setData((current) =>
        current
          ? { ...current, items: current.items.map((task) => (task.id === id ? { ...task, unseen: false, unread_mentions: 0 } : task)) }
          : current,
      )
    }
    window.addEventListener(TASK_SEEN_EVENT, onSeen)
    return () => window.removeEventListener(TASK_SEEN_EVENT, onSeen)
  }, [])

  // Live updates: a cheap fingerprint poll; the full list reloads only when something changed.
  const draggingRef = useRef(false)
  const versionRef = useRef<string | null>(null)
  useEffect(() => {
    if (view === 'templates') return
    let alive = true
    let busy = false
    const check = async () => {
      if (busy || draggingRef.current || document.visibilityState !== 'visible') return
      busy = true
      try {
        const { version } = await api<{ version: string }>('/tasks/version')
        if (!alive) return
        if (versionRef.current !== null && versionRef.current !== version) await load(true)
        versionRef.current = version
      } catch {
        // Offline or session expired: the next tick retries.
      } finally {
        busy = false
      }
    }
    void check()
    const timer = window.setInterval(() => void check(), LIVE_POLL_MS)
    const onVisible = () => void check()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, view])

  async function transition(task: Task, payload: ReasonPayload) {
    await api(`/tasks/${task.id}/transition`, { method: 'POST', body: JSON.stringify(payload) })
    await load(true)
  }

  function move(task: Task, status: string) {
    const error = transitionError(task.status, status)
    if (error) {
      showToast(error)
      return
    }
    const kind = transitionNeedsDialog(task.status, status)
    if (kind) {
      setPending({ task, kind, status })
      return
    }
    transition(task, { status }).catch((e) => showToast(e instanceof Error ? e.message : 'Переход недоступен'))
  }

  async function removeTask(task: Task) {
    await api(`/tasks/${task.id}`, { method: 'DELETE' })
    if (openTaskId === task.id) setParam({ task: null })
    showToast('Задача удалена')
    await load(true)
  }

  function moveDue(task: Task, dueAt: string) {
    setData((d) => (d ? { ...d, items: d.items.map((t) => (t.id === task.id ? { ...t, due_at: dueAt } : t)) } : d))
    api(`/tasks/${task.id}/due`, { method: 'POST', body: JSON.stringify({ due_at: dueAt }) })
      .then(() => {
        showToast(`Срок перенесён на ${dueAt.slice(8, 10)}.${dueAt.slice(5, 7)}`)
        return load(true)
      })
      .catch((e) => {
        showToast(e instanceof Error ? e.message : 'Не удалось перенести срок')
        void load(true)
      })
  }

  const groups = useMemo(() => {
    const items = data?.items || []
    const overdue = urgentFirst(items.filter((t) => t.is_overdue && OPEN.includes(t.status)))
    const open = urgentFirst(items.filter((t) => !t.is_overdue && OPEN.includes(t.status)))
    const done = urgentFirst(items.filter((t) => t.status === 'done'))
    const cancelled = urgentFirst(items.filter((t) => t.status === 'cancelled'))
    return [
      { key: 'overdue', title: `ПРОСРОЧЕНО · ${overdue.length}`, items: overdue, danger: true },
      { key: 'open', title: `ОТКРЫТЫЕ · ${open.length}`, items: open, danger: false },
      { key: 'done', title: `ВЫПОЛНЕНО · ${done.length}`, items: done, danger: false },
      { key: 'cancelled', title: `ОТМЕНЕНО · ${cancelled.length}`, items: cancelled, danger: false },
    ].filter((g) => g.items.length > 0)
  }, [data])

  const counts: Record<string, number | undefined> = {
    mine: data?.counts.mine,
    all: data?.counts.all,
    on_review: data?.counts.on_review,
    overdue: data?.counts.overdue,
  }

  const openTask = (id: number) => setParam({ task: String(id) })
  const contentClass = clsx('content-swap transition-opacity duration-200', loading && data && 'opacity-50')

  return (
    <AppShell title="Задачи" onCreateTask={() => setCreate({})}>
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 border-b border-border pb-2 lg:flex-row lg:items-center">
          <div ref={tabsRef} className="no-scrollbar relative -mx-4 flex min-w-0 gap-1 overflow-x-auto px-4 md:-mx-6 md:px-6 lg:mx-0 lg:flex-1 lg:px-0" role="tablist" aria-label="Набор задач">
            {SCOPES.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                data-scope={key}
                aria-selected={scope === key}
                className={clsx(
                  'inline-flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm whitespace-nowrap transition-colors duration-300',
                  scope === key ? 'text-text' : 'text-muted hover:text-text',
                )}
                onClick={() => setParam({ scope: key === 'all' ? null : key })}
              >
                <Icon className={clsx('h-4 w-4 shrink-0 transition-colors duration-300', scope === key && 'text-accent')} aria-hidden />
                {label}
                {counts[key] !== undefined ? <span className="tabular ml-1.5 text-muted">{counts[key]}</span> : null}
              </button>
            ))}
            <span
              aria-hidden
              className={clsx('pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-accent', indicatorReady && 'tab-indicator', !indicator && 'opacity-0')}
              style={indicator ? { width: indicator.width, transform: `translateX(${indicator.left}px)` } : undefined}
            />
          </div>
          {VISIBLE_VIEWS.length > 1 ? (
            <div className="grid shrink-0 grid-cols-2 rounded-[9px] border border-border p-1 sm:flex sm:self-start lg:self-auto">
              {VISIBLE_VIEWS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={view === key}
                  className={clsx('min-h-9 rounded-[7px] px-1 text-[13px] whitespace-nowrap sm:px-3 sm:text-sm', view === key ? 'bg-panel-2 text-accent' : 'text-muted hover:text-text')}
                  onClick={() => setParam({ view: key === DEFAULT_VIEW ? null : key })}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {view !== 'templates' ? <TaskFilters /> : null}
      </div>

      {view === 'templates' ? <TemplatesPanel onUse={(templateId) => setCreate({ templateId })} /> : null}

      {view !== 'templates' && loading && !data ? <Spinner /> : null}
      {view !== 'templates' && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!error && data && view === 'list' ? (
        <Card key={dataScope} className={clsx('overflow-hidden', contentClass)}>
          {groups.length === 0 ? (
            <div className="grid justify-items-center gap-3 p-8 text-center text-sm text-muted">
              Задач по этим условиям нет
              <Button variant="outline" onClick={() => setCreate({})}>
                + Создать задачу
              </Button>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key}>
                <button
                  type="button"
                  aria-expanded={!collapsed[g.key]}
                  className={clsx(
                    'flex min-h-11 w-full items-center justify-between px-4 text-left text-xs font-semibold tracking-wide',
                    g.danger ? 'bg-danger/10 text-danger' : 'bg-panel-2 text-muted',
                  )}
                  onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                >
                  {g.title}
                  <span aria-hidden>{collapsed[g.key] ? '+' : '−'}</span>
                </button>
                {!collapsed[g.key] ? g.items.map((t) => <TaskRow key={t.id} task={t} onOpen={openTask} />) : null}
              </div>
            ))
          )}
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
            <span>Показано {data.items.length}</span>
            <Button variant="ghost" onClick={() => setCreate({})}>
              + Добавить задачу
            </Button>
          </div>
        </Card>
      ) : null}

      {!error && data && view === 'board' ? (
        <div key={dataScope} className={contentClass}>
          <TaskBoard
            items={data.items}
            onOpen={openTask}
            onAdd={() => setCreate({})}
            onMove={move}
            onDraggingChange={(dragging) => (draggingRef.current = dragging)}
            canDelete={can('tasks', 'delete')}
            onDelete={removeTask}
          />
          <p className="text-center text-xs text-muted">
            <span className="pointer-coarse:hidden">
              Перетаскивайте карточки между этапами{can('tasks', 'delete') ? '. Вниз — чтобы удалить' : ''}
            </span>
            <span className="hidden pointer-coarse:inline">
              Удерживайте карточку, чтобы перенести её на другой этап{can('tasks', 'delete') ? ' или удалить' : ''}
            </span>
          </p>
        </div>
      ) : null}

      {!error && data && view === 'calendar' ? (
        <div key={dataScope} className={contentClass}>
          <TaskCalendar
            items={data.items}
            anchor={anchor}
            mode={calMode}
            onAnchor={(d) => setParam({ d: localDateKey(d) })}
            onMode={(m) => setParam({ cal: m === 'month' ? null : m })}
            onOpen={openTask}
            onMoveDue={moveDue}
            onCreate={(day) => setCreate({ due: `${day}T18:00` })}
          />
        </div>
      ) : null}

      <BottomSheet open={create !== null} title="Новая задача" persistent onClose={() => setCreate(null)}>
        {create ? (
          <TaskCreateForm
            defaultDue={create.due}
            initialTemplateId={create.templateId}
            onCancel={() => setCreate(null)}
            onCreated={(task) => {
              setCreate(null)
              showToast(task ? `Создана ${task.number}` : 'Нет связи — задача отправится позже')
              if (view === 'templates' && task) setParam({ view: null, task: String(task.id) })
              else void load(true)
            }}
          />
        ) : null}
      </BottomSheet>

      <TaskCard taskId={openTaskId} onClose={() => setParam({ task: null })} onChanged={() => void load(true)} />

      <ReasonDialog
        kind={pending?.kind ?? null}
        onClose={() => setPending(null)}
        onSubmit={async (payload) => {
          if (pending) await transition(pending.task, payload)
        }}
      />
      <Toast message={toast} />
    </AppShell>
  )
}

function TaskRow({ task: t, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const urgent = isUrgent(t)
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-3 text-xs lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.7fr)_auto] lg:gap-2 lg:text-sm',
        urgent
          ? 'border-[#7f1d1d] bg-[#dc2626] text-white [&_.text-danger]:text-white [&_.text-muted]:text-white/90'
          : clsx('border-border', t.unread_mentions ? 'bg-accent/10 shadow-[inset_3px_0_0_var(--color-accent)]' : ''),
      )}
    >
      <button
        type="button"
        className={clsx(
          'flex min-h-9 min-w-0 basis-full items-center gap-2 text-left text-sm font-medium break-words lg:basis-auto',
          urgent ? 'text-white' : 'hover:text-accent',
        )}
        onClick={() => onOpen(t.id)}
      >
        {t.recurrence_id ? <Repeat className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Повторяющаяся" /> : null}
        <UnseenMark unseen={t.unseen} />
        <MentionMark count={t.unread_mentions} />
        {urgent ? <UrgentBadge /> : null}
        <span className={clsx('min-w-0', t.status === 'cancelled' && !urgent && 'text-muted line-through', t.status === 'cancelled' && urgent && 'line-through')}>{t.title}</span>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <span className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px] lg:flex">
          {taskAssignees(t)[0]?.initials}
        </span>
        <span className="truncate text-muted">{assigneeLabel(t)}</span>
      </div>
      <div className={clsx('tabular', t.is_overdue ? 'text-danger' : 'text-muted')}>{t.due_label || 'Без срока'}</div>
      <div className="flex items-center gap-1 text-muted">
        <Flag
          className={clsx(
            'h-3.5 w-3.5',
            t.priority === 'high' && 'text-danger',
            t.priority === 'medium' && 'text-warning',
            t.priority === 'low' && 'text-success',
          )}
        />
        {PRIORITY_LABEL[t.priority]}
      </div>
      <div className={clsx(t.is_overdue && OPEN.includes(t.status) ? 'text-danger' : STATUS_TONE[t.status])}>
        {t.is_overdue && (t.status === 'new' || t.status === 'in_progress') ? 'Просрочено' : STATUS_LABEL[t.status]}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        {t.attachments_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="h-3.5 w-3.5" /> {t.attachments_count}
          </span>
        ) : null}
        {t.comments_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> {t.comments_count}
          </span>
        ) : null}
      </div>
    </div>
  )
}
