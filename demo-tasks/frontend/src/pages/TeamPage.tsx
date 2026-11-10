import { ArrowLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Card, ErrorState, SkeletonRows } from '../components/ui'
import { api } from '../lib/api'
import { errorText, fmtHours, fmtServerDate } from '../lib/insights'
import type { TaskStat } from './AnalyticsPage'

type Person = {
  id: number
  name: string
  initials: string
  email: string
  phone: string | null
  role_name: string
  dept_name: string | null
  color: string | null
  last_login_at: string | null
  stats: TaskStat | null
}

type TaskRow = { id: number; number: string; title: string; status: string; priority: string; due_at: string | null; overdue: boolean }
type Profile = { user: Person; stats: TaskStat; groups: Record<string, TaskRow[]> }

const GROUPS: Array<[string, string]> = [
  ['in_progress', 'В работе'],
  ['on_review', 'На проверке'],
  ['new', 'Новые'],
  ['done', 'Выполнено'],
  ['cancelled', 'Отменено'],
]

function Avatar({ person, size = 10 }: { person: Pick<Person, 'initials' | 'color'>; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs"
      style={{ color: person.color || undefined, width: size * 4, height: size * 4 }}
    >
      {person.initials}
    </span>
  )
}

function StatTiles({ s }: { s: TaskStat | null }) {
  const tiles: Array<[string, string, string]> = [
    ['Всего', String(s?.total ?? 0), ''],
    ['Выполнено', String(s?.done ?? 0), 'text-success'],
    ['В работе', String(s?.in_progress ?? 0), ''],
    ['Просрочено', String(s?.overdue ?? 0), (s?.overdue ?? 0) > 0 ? 'text-danger' : ''],
    ['Ср. время', fmtHours(s?.avg_hours), ''],
  ]
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {tiles.map(([label, value, cls]) => (
        <Card key={label} className="p-3">
          <div className="text-xs text-muted">{label}</div>
          <div className={`tabular mt-1 text-xl font-semibold ${cls}`}>{value}</div>
        </Card>
      ))}
    </div>
  )
}

export function TeamPage() {
  const { id } = useParams()
  return id ? <TeamProfile id={Number(id)} /> : <TeamList />
}

function TeamList() {
  const [people, setPeople] = useState<Person[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    void api<{ people: Person[] }>('/team')
      .then((d) => setPeople(d.people))
      .catch((e) => setError(errorText(e)))
  }, [])

  return (
    <AppShell title="Команда" subtitle="Сотрудники и их задачи" showFilters={false}>
      {!people && !error ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} /> : null}
      <div className="page-enter grid gap-3 lg:grid-cols-2">
        {people?.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/team/${p.id}`)}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] border border-border bg-panel p-3 text-left hover:bg-panel-2"
          >
            <Avatar person={p} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted">{p.role_name} · {p.dept_name || 'без отдела'}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
                <span>в работе <b className="tabular text-text">{p.stats?.in_progress ?? 0}</b></span>
                <span>выполнено <b className="tabular text-text">{p.stats?.done ?? 0}</b></span>
                {(p.stats?.overdue ?? 0) > 0 ? <span className="text-danger">просрочено {p.stats?.overdue}</span> : null}
              </div>
            </div>
            <ChevronRight size={18} className="text-muted" />
          </button>
        ))}
      </div>
    </AppShell>
  )
}

function TeamProfile({ id }: { id: number }) {
  const [data, setData] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setData(null)
    void api<Profile>(`/team/${id}`)
      .then(setData)
      .catch((e) => setError(errorText(e)))
  }, [id])

  return (
    <AppShell title={data?.user.name ?? 'Сотрудник'} subtitle="Профиль сотрудника" showFilters={false}>
      <Link to="/team" className="mb-4 inline-flex min-h-9 items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft size={16} /> Вся команда
      </Link>
      {!data && !error ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} /> : null}
      {data ? (
        <div className="page-enter grid gap-4">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <Avatar person={data.user} size={14} />
            <div className="min-w-0 flex-1">
              <div className="text-lg font-semibold break-words">{data.user.name}</div>
              <div className="text-sm text-muted">{data.user.role_name} · {data.user.dept_name || 'без отдела'}</div>
              <div className="mt-1 text-xs break-all text-muted">{data.user.email}{data.user.phone ? ` · ${data.user.phone}` : ''}</div>
            </div>
            <div className="text-sm">
              <div className="text-xs text-muted">Последний вход</div>
              <div>{data.user.last_login_at ? fmtServerDate(data.user.last_login_at) : 'ещё не входил'}</div>
            </div>
          </Card>
          <StatTiles s={data.stats} />
          {GROUPS.map(([key, label]) => {
            const list = data.groups[key] ?? []
            if (list.length === 0) return null
            return (
              <Card key={key} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-border p-3 text-sm font-medium">
                  {label} <span className="tabular text-muted">{list.length}</span>
                </div>
                {list.slice(0, 50).map((t) => (
                  <div key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border p-3 text-sm last:border-0">
                    <div className="min-w-0">
                      <div className="truncate">{t.title}</div>
                      <div className="text-xs text-muted">{t.number}{t.due_at ? ` · срок ${fmtServerDate(t.due_at, false)}` : ''}</div>
                    </div>
                    {t.overdue ? <Badge tone="danger">просрочена</Badge> : null}
                  </div>
                ))}
              </Card>
            )
          })}
        </div>
      ) : null}
    </AppShell>
  )
}
