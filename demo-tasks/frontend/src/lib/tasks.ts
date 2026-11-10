import { useEffect, useState } from 'react'
import { api } from './api'

export type TaskStatus = 'new' | 'in_progress' | 'on_review' | 'done' | 'cancelled'

export type Task = {
  id: number
  number: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: 'low' | 'medium' | 'high'
  department_id: number | null
  department_slug: string | null
  department_name: string | null
  department_color: string | null
  assignee_id: number
  assignee_name: string
  assignee_initials: string
  assignee_role: string
  assignees?: Array<{ id: number; name: string; initials: string; role?: string }>
  creator_id: number
  creator_name: string | null
  creator_initials: string | null
  starts_at: string | null
  due_at: string | null
  due_label: string | null
  completed_at: string | null
  is_overdue: boolean
  is_urgent?: number | boolean
  cancel_reason: string | null
  deal_id: number | null
  client_id: number | null
  template_id: number | null
  recurrence_id: number | null
  comments_count: number
  attachments_count: number
  created_at: string
  unseen?: boolean
  /** Unread @mentions of the viewer in this task's comments. */
  unread_mentions?: number
  kpi_key?: string | null
  recur_on?: string | null
  requires_file?: boolean
  requires_photo?: boolean
  requires_checklist?: boolean
  /** When the task was sent to review — the KPI «timely» moment. */
  submitted_at?: string | null
  was_late?: boolean
}

export type CommentAttachment = { id: number; name: string; mime: string; size: number; created_at: string; url: string }

export type TaskComment = {
  id: number
  body: string
  created_at: string
  edited_at: string | null
  user_id: number
  name: string
  initials: string
  attachments: CommentAttachment[]
  can_edit: boolean
}

export type TaskDetail = Task & {
  comments: TaskComment[]
  history: Array<{ id: number; field_name: string; old_value: string | null; new_value: string | null; created_at: string; user_name: string | null }>
  checklist: Array<{ id: number; title: string; is_done: boolean }>
  attachments: Array<{ id: number; name: string; mime: string; size: number; created_at: string; user_id: number; user_name: string; url: string }>
  deal: { id: number; number: string; title: string } | null
  can: { edit: boolean; delete: boolean; accept: boolean; return: boolean; transition: boolean }
  proof?: { requires_file: boolean; requires_photo: boolean; requires_checklist: boolean; missing: string[] }
}

export type TeamUser = {
  id: number
  name: string
  initials: string
  department_id: number | null
  role_slug: string
  role_name: string
  department_name: string | null
  department_color: string | null
}

export type Department = { id: number; slug: string; name: string; color: string }

export type TaskTemplate = {
  id: number
  slug: string | null
  title: string
  description: string | null
  department_id: number | null
  department_name: string | null
  department_color: string | null
  priority: Task['priority']
  checklist: string[]
  due_in_hours: number
  requires_file?: boolean
  requires_photo?: boolean
  requires_checklist?: boolean
  kpi_key?: string | null
}

export type TaskRecurrence = {
  id: number
  template_id: number
  template_title: string
  assignee_id: number
  assignee_name: string
  assignees?: Array<{ id: number; name: string }>
  rule: 'daily' | 'weekly' | 'monthly'
  weekdays: number[]
  month_day: number | null
  run_time: string
  is_active: boolean
  next_run_at: string
  last_run_at: string | null
  due_time?: string | null
  skip_non_working?: boolean
}

export type KpiIndicator = { key: string; title: string; max_amount: number }
export type WorkCalendar = {
  holidays: Array<{ day: string; title: string | null }>
  vacations: Array<{ id: number; user_id: number; user_name: string; starts_on: string; ends_on: string; note: string | null }>
  kpi_indicators: KpiIndicator[]
}
export const loadWorkCalendar = () => api<WorkCalendar>('/work-calendar')

export type UserPrefs = {
  saved_filters: Array<{ name: string; query: string }>
  widget_order: string[] | null
  hidden_widgets: string[]
  sidebar_order?: string[] | null
}

export const loadPrefs = () => api<UserPrefs>('/me/prefs')
export const savePrefs = (patch: Partial<UserPrefs>) => api<UserPrefs>('/me/prefs', { method: 'PUT', body: JSON.stringify(patch) })

export const STATUS_LABEL: Record<string, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  on_review: 'На проверке',
  done: 'Выполнена',
  cancelled: 'Отменена',
}

export const STATUS_TONE: Record<string, string> = {
  new: 'text-status-new',
  in_progress: 'text-status-progress',
  on_review: 'text-status-review',
  done: 'text-status-done',
  cancelled: 'text-muted',
}

export const PRIORITY_LABEL: Record<string, string> = {
  low: 'Низкий',
  medium: 'Средний',
  high: 'Высокий',
}

export const BOARD_COLUMNS = [
  { key: 'new', label: 'Новая' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'on_review', label: 'На проверке' },
  { key: 'done', label: 'Выполнена' },
  { key: 'cancelled', label: 'Отменена' },
] as const

export const HISTORY_LABEL: Record<string, string> = {
  status: 'Статус',
  due_at: 'Срок',
  starts_at: 'Начало',
  assignee_id: 'Ответственный',
  assignees: 'Ответственные',
  department_id: 'Отдел',
  priority: 'Приоритет',
  is_urgent: 'Срочно',
  title: 'Название',
  watcher_added: 'Добавлен наблюдатель',
  watcher_removed: 'Удалён наблюдатель',
  attachment_added: 'Добавлен файл',
  attachment_removed: 'Удалён файл',
}

export const WEEKDAY_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

/** Server datetimes are Asia/Almaty wall-clock strings "YYYY-MM-DD HH:MM:SS". */
export function toInputDateTime(value: string | null | undefined): string {
  return value ? value.slice(0, 16).replace(' ', 'T') : ''
}

export function fromInputDateTime(value: string): string | null {
  return value ? `${value.replace('T', ' ')}:00` : null
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const [date, time = ''] = value.split(' ')
  const [y, m, d] = date.split('-')
  return `${d}.${m}.${y}${time ? ' ' + time.slice(0, 5) : ''}`
}

export function historyValue(field: string, value: string | null): string {
  if (!value) return '—'
  if (field === 'status') return STATUS_LABEL[value] || value
  if (field === 'priority') return PRIORITY_LABEL[value] || value
  if (field === 'due_at' || field === 'starts_at') return formatDateTime(value)
  return value
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

/** Product cap per file. The server may answer with a lower hosting limit. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
export const ATTACHMENT_MAX_FILES = 10
export const ATTACHMENT_ACCEPT = 'image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip'
export const ATTACHMENT_TOO_BIG = 'Файл слишком большой. Максимум — 10 МБ'

export function isUrgent(task: { is_urgent?: number | boolean | string | null }): boolean {
  return task.is_urgent === true || task.is_urgent === 1 || task.is_urgent === '1'
}

export function urgentFirst<T extends { is_urgent?: number | boolean | string | null }>(items: T[]): T[] {
  return items
    .map((task, index) => ({ task, index }))
    .sort((a, b) => Number(isUrgent(b.task)) - Number(isUrgent(a.task)) || a.index - b.index)
    .map((row) => row.task)
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function cached<T>(path: string, pick: (data: unknown) => T) {
  let promise: Promise<T> | null = null
  return () => {
    if (!promise) {
      promise = api<unknown>(path)
        .then(pick)
        .catch((e) => {
          promise = null
          throw e
        })
    }
    return promise
  }
}

const loadUsers = cached('/meta/users', (d) => (d as { items: TeamUser[] }).items)
const loadDepartments = cached('/meta/departments', (d) => (d as { items: Department[] }).items)

function useCached<T>(loader: () => Promise<T[]>): T[] {
  const [items, setItems] = useState<T[]>([])
  useEffect(() => {
    let alive = true
    loader()
      .then((data) => alive && setItems(data))
      .catch(() => alive && setItems([]))
    return () => {
      alive = false
    }
  }, [loader])
  return items
}

export function useTeamUsers(): TeamUser[] {
  return useCached(loadUsers)
}

export function useDepartments(): Department[] {
  return useCached(loadDepartments)
}

// Mirrors TaskWorkflow::canTransit status map; role checks stay on the server.
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  new: ['in_progress', 'cancelled'],
  in_progress: ['on_review', 'cancelled'],
  on_review: ['done', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
}

export function transitionError(from: string, to: string): string | null {
  if (ALLOWED_TRANSITIONS[from]?.includes(to)) return null
  if (to === 'done') return 'Сначала отправьте задачу на проверку: принимает результат постановщик'
  if (to === 'on_review') return 'На проверку отправляют задачу из статуса «В работе»'
  return `Из статуса «${STATUS_LABEL[from] || from}» нельзя перевести в «${STATUS_LABEL[to] || to}»`
}

export function taskAssignees(task: Pick<Task, 'assignees' | 'assignee_id' | 'assignee_name' | 'assignee_initials' | 'assignee_role'>) {
  if (task.assignees && task.assignees.length > 0) return task.assignees
  return [{ id: task.assignee_id, name: task.assignee_name, initials: task.assignee_initials, role: task.assignee_role }]
}

export function assigneeLabel(task: Pick<Task, 'assignees' | 'assignee_id' | 'assignee_name' | 'assignee_initials' | 'assignee_role'>): string {
  return taskAssignees(task).map((person) => person.name).join(', ')
}

export function transitionNeedsDialog(from: string, to: string): 'cancel' | 'return' | null {
  if (to === 'cancelled') return 'cancel'
  if (from === 'on_review' && to === 'in_progress') return 'return'
  return null
}
