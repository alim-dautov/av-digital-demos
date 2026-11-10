import clsx from 'clsx'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Briefcase,
  Building2,
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  EllipsisVertical,
  Handshake,
  Inbox,
  Megaphone,
  Monitor,
  Package,
  PlugZap,
  SlidersHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { TaskCreateForm } from '../components/tasks/TaskCreateForm'
import { BottomSheet, Button, Card, ErrorState, Select, Spinner, Toast } from '../components/ui'
import { api, getLastUpdated } from '../lib/api'
import { formatTimeRu } from '../lib/format'
import { STATUS_LABEL, assigneeLabel, isUrgent, loadPrefs, savePrefs, taskAssignees, useDepartments, type Task, type UserPrefs } from '../lib/tasks'
import { UrgentBadge } from '../components/tasks/UrgentToggle'

type Dashboard = {
  widgets: string[]
  kpi: {
    today: number
    overdue: number
    on_review: number
    no_due: number
    new_leads: number | null
    deals_no_next: number | null
    integration_errors: number | null
  }
  attention_counts?: { all: number; overdue: number; on_review: number }
  attention: Task[]
  team_load: Array<{ id: number; name: string; initials: string; role: string; count: number; color: string }>
  by_department: Array<{ slug: string; name: string; color: string; count: number }>
  week: Array<{
    date: string
    label: string
    weekday: string
    is_today: boolean
    is_weekend: boolean
    tasks: Array<{ id: number; title: string; color: string; status: string }>
  }>
}

type KpiDef = { label: string; hint: string; href: string; icon: LucideIcon; tone: string; value: (d: Dashboard) => number | null }

const KPI: Record<string, KpiDef> = {
  kpi_today: { label: 'На сегодня', hint: 'задачи в работе', href: '/tasks?due=today', icon: CalendarCheck, tone: 'bg-success/12 text-success', value: (d) => d.kpi.today },
  kpi_overdue: { label: 'Просрочено', hint: 'задач требуют реакции', href: '/tasks?due=overdue', icon: Clock, tone: 'bg-accent/12 text-accent', value: (d) => d.kpi.overdue },
  kpi_review: { label: 'На проверке', hint: 'задач на согласовании', href: '/tasks?scope=on_review', icon: CircleCheck, tone: 'bg-warning/12 text-warning', value: (d) => d.kpi.on_review },
  kpi_no_due: {
    label: 'Без срока',
    hint: 'открытых задач без дедлайна',
    href: '/tasks?due=none&status=new,in_progress,on_review',
    icon: CalendarX,
    tone: 'bg-info/12 text-info',
    value: (d) => d.kpi.no_due,
  },
  new_leads: { label: 'Новые заявки', hint: 'ещё не взяты в работу', href: '/sales', icon: Inbox, tone: 'bg-dept-marketing/12 text-dept-marketing', value: (d) => d.kpi.new_leads },
  deals_no_next: { label: 'Сделки без шага', hint: 'нет открытой задачи', href: '/sales', icon: Handshake, tone: 'bg-dept-it/12 text-dept-it', value: (d) => d.kpi.deals_no_next },
  integration_errors: {
    label: 'Ошибки интеграций',
    hint: 'сбоев фоновых задач за 7 дней',
    href: '/settings',
    icon: PlugZap,
    tone: 'bg-danger/12 text-danger',
    value: (d) => d.kpi.integration_errors,
  },
}

const BLOCK_LABEL: Record<string, string> = {
  attention: 'Требуют внимания',
  team_load: 'Загрузка команды',
  week: 'Сроки на неделю',
  by_department: 'Задачи по отделам',
}

const BLOCK_ORDER = Object.keys(BLOCK_LABEL)
const ATTENTION_LIMIT = 6
const ATTENTION_HREF = { all: '/tasks?scope=all&status=new,in_progress,on_review', overdue: '/tasks?scope=overdue', on_review: '/tasks?scope=on_review' }
const WIDE_BLOCKS = new Set(['attention', 'week'])

const DEPARTMENT_ICON: Record<string, LucideIcon> = {
  sales: BarChart3,
  operations: Users,
  warehouse: Package,
  marketing: Megaphone,
  it: Monitor,
  management: Briefcase,
}

const STATUS_PILL: Record<string, string> = {
  new: 'bg-status-new/15 text-muted',
  in_progress: 'bg-status-progress/15 text-status-progress',
  on_review: 'bg-status-review/15 text-status-review',
  done: 'bg-status-done/15 text-status-done',
  cancelled: 'bg-panel-2 text-muted',
  overdue: 'bg-danger/15 text-danger',
}

const MONTHS_GENITIVE = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

const PERIODS = [
  ['today', 'Сегодня'],
  ['week', 'Эта неделя'],
  ['month', 'Этот месяц'],
  ['all', 'Всё время'],
] as const

function widgetLabel(key: string): string {
  return KPI[key]?.label || BLOCK_LABEL[key] || key
}

function orderWidgets(allowed: string[], prefs: UserPrefs | null): string[] {
  if (!prefs?.widget_order) {
    const blocks = allowed.filter((k) => BLOCK_LABEL[k]).sort((a, b) => BLOCK_ORDER.indexOf(a) - BLOCK_ORDER.indexOf(b))
    return [...allowed.filter((k) => !BLOCK_LABEL[k]), ...blocks]
  }
  const ordered = prefs.widget_order.filter((k) => allowed.includes(k))
  return [...ordered, ...allowed.filter((k) => !ordered.includes(k))]
}

function tasksWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'задача'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи'
  return 'задач'
}

function weekRangeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  if (fy === ty && fm === tm) return `${fd} — ${td} ${MONTHS_GENITIVE[tm - 1]} ${ty}`
  if (fy === ty) return `${fd} ${MONTHS_GENITIVE[fm - 1]} — ${td} ${MONTHS_GENITIVE[tm - 1]} ${ty}`
  return `${fd} ${MONTHS_GENITIVE[fm - 1]} ${fy} — ${td} ${MONTHS_GENITIVE[tm - 1]} ${ty}`
}

function taskStatus(t: Task): { key: string; label: string } {
  if (t.is_overdue && t.status !== 'on_review') return { key: 'overdue', label: 'Просрочено' }
  return { key: t.status, label: STATUS_LABEL[t.status] || t.status }
}

function StatusPill({ task }: { task: Task }) {
  const status = taskStatus(task)
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-[7px] px-2 py-1 text-xs whitespace-nowrap', STATUS_PILL[status.key])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status.label}
    </span>
  )
}

function dueClass(t: Task): string | undefined {
  if (t.is_overdue) return 'font-medium text-danger'
  if (t.due_label === 'Сегодня') return 'font-medium text-accent'
  return undefined
}

function Avatar({ initials, className }: { initials: string; className?: string }) {
  return <span className={clsx('flex shrink-0 items-center justify-center rounded-full bg-panel-2 font-medium text-text', className)}>{initials}</span>
}

function BlockTitle({ title, hint, children }: { title: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-3">
      <div className="mr-auto min-w-0">
        <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
        {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      </div>
      {children}
    </div>
  )
}

export function OverviewPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const departments = useDepartments()
  const period = params.get('period') || 'week'
  const departmentId = params.get('department_id') || ''
  const [data, setData] = useState<Dashboard | null>(null)
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'overdue' | 'on_review'>('all')
  const [weekOffset, setWeekOffset] = useState(0)
  const [create, setCreate] = useState<{ due?: string } | null>(null)
  const [customize, setCustomize] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const updated = getLastUpdated()

  const load = useCallback(async () => {
    setError(null)
    try {
      const qs = new URLSearchParams({ period })
      if (departmentId) qs.set('department_id', departmentId)
      if (weekOffset) qs.set('week_offset', String(weekOffset))
      setData(await api<Dashboard>(`/dashboard?${qs.toString()}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [period, departmentId, weekOffset])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    loadPrefs()
      .then(setPrefs)
      .catch(() => setPrefs(null))
  }, [])

  function setFilter(key: string, value: string, fallback: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value && value !== fallback) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const ordered = useMemo(() => orderWidgets(data?.widgets || [], prefs), [data, prefs])
  const visible = ordered.filter((k) => !prefs?.hidden_widgets.includes(k))
  const kpis = visible.filter((k) => KPI[k])
  const blocks = visible.filter((k) => BLOCK_LABEL[k])
  const hasSideBlocks = blocks.some((k) => !WIDE_BLOCKS.has(k))
  const departmentName = departments.find((d) => String(d.id) === departmentId)?.name

  const toolbar = (
    <>
      <Select aria-label="Отдел" className="min-w-0 flex-1 sm:w-auto sm:flex-none" value={departmentId} onChange={(e) => setFilter('department_id', e.target.value, '')}>
        <option value="">Все отделы</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Период" className="min-w-0 flex-1 sm:w-auto sm:flex-none" value={period} onChange={(e) => setFilter('period', e.target.value, 'week')}>
        {PERIODS.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Button variant="ghost" className="px-3 text-muted sm:px-4" onClick={() => setCustomize(true)} disabled={!data} aria-label="Виджеты">
        <SlidersHorizontal className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Виджеты</span>
      </Button>
    </>
  )

  const attentionAll = (data?.attention || []).filter((t) => {
    if (tab === 'overdue') return t.is_overdue
    if (tab === 'on_review') return t.status === 'on_review'
    return true
  })
  const attention = attentionAll.slice(0, ATTENTION_LIMIT)
  const attentionTotal = data?.attention_counts?.[tab] ?? attentionAll.length
  const maxDept = Math.max(1, ...(data?.by_department || []).map((d) => d.count))
  const maxLoad = Math.max(1, ...(data?.team_load || []).map((u) => u.count))
  const openTask = (id: number) => navigate(`/tasks?task=${id}`)

  const renderBlock = (key: string, d: Dashboard): ReactNode => {
    if (key === 'attention') {
      return (
        <Card className="h-full overflow-hidden">
          <BlockTitle title="Требуют внимания">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['all', `Все (${d.attention_counts?.all ?? d.attention.length})`],
                  ['overdue', `Просрочено (${d.attention_counts?.overdue ?? 0})`],
                  ['on_review', `На проверке (${d.attention_counts?.on_review ?? 0})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tab === k}
                  className={clsx(
                    'min-h-9 rounded-[9px] border px-3 text-xs transition-colors duration-200',
                    tab === k ? 'border-accent/60 bg-accent/10 text-accent' : 'border-border text-muted hover:bg-panel-2 hover:text-text',
                  )}
                  onClick={() => setTab(k)}
                >
                  {label}
                </button>
              ))}
            </div>
          </BlockTitle>
          <ul className="md:hidden">
            {attention.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">Нет задач в этой выборке</li> : null}
            {attention.map((t) => (
              <li key={t.id} className={clsx('border-t border-border', isUrgent(t) && 'border-[#7f1d1d] bg-[#dc2626] text-white [&_.text-muted]:text-white/90')}>
                <button type="button" className="grid w-full gap-2 px-4 py-3 text-left active:bg-white/10" onClick={() => openTask(t.id)}>
                  <span className="flex items-center gap-2 text-sm font-medium break-words">
                    {isUrgent(t) ? <UrgentBadge /> : null}
                    {t.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Avatar initials={taskAssignees(t)[0]?.initials || ''} className="h-5 w-5 text-[9px]" />
                      <span className="truncate">{assigneeLabel(t)}</span>
                    </span>
                    <span className={clsx('tabular', dueClass(t))}>{t.due_label || '—'}</span>
                    <StatusPill task={t} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto px-4 pb-4 md:block">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr className="bg-panel-2/60">
                  <th className="rounded-l-[8px] px-3 py-2.5 font-medium">Задача</th>
                  <th className="px-3 py-2.5 font-medium">Ответственный</th>
                  <th className="px-3 py-2.5 font-medium">Срок</th>
                  <th className="px-3 py-2.5 font-medium">Статус</th>
                  <th className="w-10 rounded-r-[8px] px-3 py-2.5">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {attention.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted">
                      Нет задач в этой выборке
                    </td>
                  </tr>
                ) : (
                  attention.map((t) => (
                    <tr
                    key={t.id}
                    className={clsx(
                      'cursor-pointer border-b border-border transition-colors last:border-b-0 hover:bg-panel-2/50',
                      isUrgent(t) && 'border-[#7f1d1d] bg-[#dc2626] text-white hover:bg-[#b91c1c] [&_.text-muted]:text-white/90 [&_a]:text-white',
                    )}
                    onClick={() => openTask(t.id)}
                  >
                      <td className="px-3 py-3">
                        <a href={`/tasks?task=${t.id}`} onClick={(e) => e.preventDefault()} className="inline-flex items-center gap-2 hover:text-accent">
                          {isUrgent(t) ? <UrgentBadge /> : null}
                          {t.title}
                        </a>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar initials={taskAssignees(t)[0]?.initials || ''} className="h-7 w-7 text-[10px]" />
                          <span className="truncate text-muted">{assigneeLabel(t)}</span>
                        </div>
                      </td>
                      <td className={clsx('tabular px-3 py-3 whitespace-nowrap', dueClass(t))}>{t.due_label || '—'}</td>
                      <td className="px-3 py-3">
                        <StatusPill task={t} />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          type="button"
                          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted hover:bg-panel-2 hover:text-text"
                          aria-label={`Открыть «${t.title}»`}
                          onClick={(e) => {
                            e.stopPropagation()
                            openTask(t.id)
                          }}
                        >
                          <EllipsisVertical className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {attentionTotal > attention.length ? (
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-center gap-1 border-t border-border text-xs text-muted transition-colors hover:text-accent"
              onClick={() => navigate(ATTENTION_HREF[tab])}
            >
              Все задачи ({attentionTotal})
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </Card>
      )
    }
    if (key === 'team_load') {
      return (
        <Card className="h-full">
          <BlockTitle title="Загрузка команды" hint="Активные задачи" />
          {d.team_load.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Открытых задач нет</p> : null}
          <div className="flex flex-col px-2 pb-2">
            {d.team_load.map((u) => (
              <button
                key={u.id}
                type="button"
                className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 text-left transition-colors hover:bg-panel-2/60"
                onClick={() => navigate(`/tasks?assignee_id=${u.id}&status=new,in_progress,on_review`)}
              >
                <Avatar initials={u.initials} className="h-8 w-8 text-xs" />
                <div className="w-28 min-w-0 shrink-0 sm:w-32">
                  <div className="truncate text-sm">{u.name}</div>
                  <div className="truncate text-[11px] text-muted">{u.role}</div>
                </div>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.round((u.count / maxLoad) * 100)}%`, background: u.color }} />
                </div>
                <div className="tabular w-16 shrink-0 text-right text-xs text-muted">
                  {u.count} {tasksWord(u.count)}
                </div>
              </button>
            ))}
          </div>
        </Card>
      )
    }
    if (key === 'by_department') {
      return (
        <Card className="h-full">
          <BlockTitle title="Задачи по отделам" />
          {d.by_department.length === 0 ? <p className="px-4 pb-4 text-sm text-muted">Открытых задач нет</p> : null}
          <div className="flex flex-col px-2 pb-2">
            {d.by_department.map((dep) => {
              const Icon = DEPARTMENT_ICON[dep.slug] || Building2
              const id = departments.find((x) => x.slug === dep.slug)?.id
              return (
                <button
                  key={dep.slug}
                  type="button"
                  disabled={!id}
                  className="flex min-h-12 items-center gap-3 rounded-[10px] px-2 text-left transition-colors hover:bg-panel-2/60 disabled:hover:bg-transparent"
                  onClick={() => navigate('/tasks?status=new,in_progress,on_review')}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ background: `${dep.color}1f`, color: dep.color }}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="w-24 min-w-0 shrink-0 truncate text-sm">{dep.name}</span>
                  <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-panel-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.round((dep.count / maxDept) * 100)}%`, background: dep.color }} />
                  </div>
                  <span className="tabular w-8 shrink-0 text-right text-sm text-muted">{dep.count}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )
    }
    if (key === 'week') {
      const range = d.week.length ? weekRangeLabel(d.week[0].date, d.week[d.week.length - 1].date) : ''
      return (
        <Card className="h-full overflow-hidden">
          <BlockTitle title="Сроки на неделю">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border text-muted hover:bg-panel-2 hover:text-text"
                aria-label="Предыдущая неделя"
                onClick={() => setWeekOffset((w) => w - 1)}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="tabular min-w-36 rounded-[9px] px-1 text-center text-xs text-muted hover:text-text disabled:hover:text-muted"
                disabled={weekOffset === 0}
                title={weekOffset !== 0 ? 'К текущей неделе' : undefined}
                onClick={() => setWeekOffset(0)}
              >
                {range}
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border text-muted hover:bg-panel-2 hover:text-text"
                aria-label="Следующая неделя"
                onClick={() => setWeekOffset((w) => w + 1)}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </BlockTitle>
          <div className="px-4 pb-4 md:overflow-x-auto">
            <div className="grid grid-cols-1 gap-2 md:min-w-[640px] md:grid-cols-7 md:gap-0 md:divide-x md:divide-border md:overflow-hidden md:rounded-[12px] md:border md:border-border">
              {d.week.map((day) => (
                <div
                  key={day.date}
                  className={clsx(
                    'flex flex-col rounded-[12px] border border-border p-2 md:min-h-44 md:rounded-none md:border-0',
                    day.is_today ? 'bg-accent/8' : 'bg-bg/40',
                  )}
                >
                  <div
                    className={clsx(
                      'mb-2 flex items-baseline gap-1.5 md:flex-col md:items-center md:gap-0 md:border-b md:border-border md:pb-2',
                      day.is_today ? 'text-accent' : day.is_weekend ? 'text-danger' : 'text-text',
                    )}
                  >
                    <span className="tabular text-base font-semibold md:text-lg">{Number(day.label)}</span>
                    <span className={clsx('text-xs lowercase', !day.is_today && !day.is_weekend && 'text-muted')}>{day.weekday}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {day.tasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={clsx(
                          'flex min-h-8 items-start gap-1.5 rounded-[8px] px-2 py-1.5 text-left text-xs transition-colors md:min-h-0 md:text-[11px]',
                          day.is_today ? 'bg-accent/10 hover:bg-accent/15' : 'bg-panel-2 hover:bg-panel-2/70',
                          t.status === 'done' && 'line-through opacity-60',
                        )}
                        title={t.title}
                        onClick={() => openTask(t.id)}
                      >
                        <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="line-clamp-2 min-w-0 break-words hyphens-auto">{t.title}</span>
                      </button>
                    ))}
                    {day.tasks.length > 3 ? (
                      <button
                        type="button"
                        className="text-left text-[11px] text-muted hover:text-text"
                        onClick={() => navigate(`/tasks?view=calendar&cal=week&d=${day.date}`)}
                      >
                        ещё {day.tasks.length - 3}
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="mt-1 min-h-9 w-full rounded-[8px] text-xs text-muted transition-colors hover:text-accent md:mt-auto md:min-h-8 md:text-[11px]"
                    onClick={() => setCreate({ due: `${day.date}T18:00` })}
                  >
                    + Добавить
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )
    }
    return null
  }

  return (
    <AppShell
      title="Контроль компании"
      subtitle={departmentName ? `${departmentName}. Все задачи отдела на одном экране.` : 'Все отделы. Все задачи. Один экран.'}
      toolbar={toolbar}
      onCreateTask={() => setCreate({})}
    >
      <div className="mb-3 text-xs text-muted">{updated ? `Обновлено в ${formatTimeRu(updated)}` : 'Загрузка…'}</div>

      {loading ? <Spinner /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && data ? (
        <>
          {kpis.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {kpis.map((key) => {
                const def = KPI[key]
                const Icon = def.icon
                const value = def.value(data) ?? 0
                return (
                  <button
                    key={key}
                    type="button"
                    className="group flex min-w-0 flex-col gap-3 rounded-[14px] border border-border bg-panel p-3 text-left transition-colors duration-200 hover:border-accent/40 sm:flex-row sm:items-start sm:gap-4 sm:p-4"
                    onClick={() => navigate(def.href)}
                  >
                    <span className={clsx('flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] sm:h-12 sm:w-12', def.tone)}>
                      <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{def.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-text" aria-hidden />
                      </span>
                      <span className="tabular mt-1 block text-2xl font-semibold sm:text-3xl">{value}</span>
                      <span className="mt-0.5 block text-xs text-muted">{def.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : null}
          {blocks.length > 0 ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
              {blocks.map((key) => (
                <div key={key} className={clsx('min-w-0', WIDE_BLOCKS.has(key) && (hasSideBlocks ? 'xl:col-span-2' : 'xl:col-span-3'))}>
                  {renderBlock(key, data)}
                </div>
              ))}
            </div>
          ) : null}
          {visible.length === 0 ? (
            <Card className="grid justify-items-center gap-3 p-8 text-sm text-muted">
              Все виджеты скрыты
              <Button variant="outline" onClick={() => setCustomize(true)}>
                Настроить
              </Button>
            </Card>
          ) : null}
        </>
      ) : null}

      <BottomSheet open={create !== null} title="Новая задача" persistent onClose={() => setCreate(null)}>
        {create ? (
          <TaskCreateForm
            defaultDue={create.due}
            onCancel={() => setCreate(null)}
            onCreated={(task) => {
              setCreate(null)
              setToast(task ? `Создана ${task.number}` : 'Нет связи — задача отправится позже')
              window.setTimeout(() => setToast(null), 3500)
              void load()
            }}
          />
        ) : null}
      </BottomSheet>

      {data ? (
        <WidgetSettings
          open={customize}
          allowed={data.widgets}
          prefs={prefs}
          onClose={() => setCustomize(false)}
          onSave={async (order, hidden) => {
            setPrefs(await savePrefs({ widget_order: order, hidden_widgets: hidden }))
            setCustomize(false)
          }}
        />
      ) : null}
      <Toast message={toast} />
    </AppShell>
  )
}

function WidgetSettings({
  open,
  allowed,
  prefs,
  onClose,
  onSave,
}: {
  open: boolean
  allowed: string[]
  prefs: UserPrefs | null
  onClose: () => void
  onSave: (order: string[] | null, hidden: string[]) => Promise<void>
}) {
  const [order, setOrder] = useState<string[]>([])
  const [hidden, setHidden] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setOrder(orderWidgets(allowed, prefs))
    setHidden(prefs?.hidden_widgets.filter((k) => allowed.includes(k)) || [])
  }, [open, allowed, prefs])

  const move = (i: number, dir: number) =>
    setOrder((o) => {
      const next = [...o]
      const j = i + dir
      if (j < 0 || j >= next.length) return o
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  return (
    <BottomSheet open={open} title="Виджеты" onClose={onClose}>
      <ul className="grid gap-1">
        {order.map((key, i) => {
          const shown = !hidden.includes(key)
          return (
            <li key={key} className="flex min-h-11 items-center gap-2 rounded-[9px] px-2 hover:bg-panel-2">
              <label className="flex flex-1 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--color-accent)]"
                  checked={shown}
                  onChange={() => setHidden((h) => (shown ? [...h, key] : h.filter((k) => k !== key)))}
                />
                <span className={clsx(!shown && 'text-muted')}>{widgetLabel(key)}</span>
              </label>
              <button type="button" className="flex h-9 w-9 items-center justify-center text-muted hover:text-text disabled:opacity-30" disabled={i === 0} aria-label={`Выше: ${widgetLabel(key)}`} onClick={() => move(i, -1)}>
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-muted hover:text-text disabled:opacity-30"
                disabled={i === order.length - 1}
                aria-label={`Ниже: ${widgetLabel(key)}`}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex gap-2">
        <Button
          className="flex-1"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onSave(order, hidden).finally(() => setBusy(false))
          }}
        >
          Сохранить
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onSave(null, []).finally(() => setBusy(false))
          }}
        >
          По умолчанию
        </Button>
      </div>
    </BottomSheet>
  )
}
