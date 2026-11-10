import { useCallback, useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Card, ErrorState, Input, SkeletonRows } from '../components/ui'
import { api } from '../lib/api'
import { errorText, fmtHours, fmtServerDate } from '../lib/insights'

export type TaskStat = {
  user_id: number
  name: string
  total: number
  done: number
  in_progress: number
  overdue: number
  avg_hours: number | null
}
type Data = { from: string; to: string; items: TaskStat[]; ranking: TaskStat[] }

const PERIODS = [
  ['week', 'Неделя'],
  ['month', 'Месяц'],
  ['custom', 'Свой период'],
] as const

export function AnalyticsPage() {
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('month')
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today.slice(0, 8) + '01')
  const [to, setTo] = useState(today)
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const q = period === 'custom' ? `period=custom&from=${from}&to=${to}` : `period=${period}`
      setData(await api<Data>(`/analytics/tasks?${q}`))
    } catch (e) {
      setError(errorText(e))
    }
  }, [period, from, to])

  useEffect(() => {
    void load()
  }, [load])

  const ranked = data?.ranking.filter((r) => r.avg_hours !== null) ?? []
  const maxAvg = Math.max(1, ...ranked.map((r) => r.avg_hours ?? 0))

  return (
    <AppShell title="Аналитика" subtitle="Задачи по сотрудникам" showFilters={false}>
      <div className="page-enter mb-4 flex flex-wrap items-center gap-2">
        {PERIODS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setPeriod(key)}
            className={`min-h-9 rounded-full border px-3 text-sm ${period === key ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
          >
            {label}
          </button>
        ))}
        {period === 'custom' ? (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" aria-label="С" />
            <span className="text-muted">—</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" aria-label="По" />
          </div>
        ) : null}
      </div>
      {data ? (
        <p className="mb-3 text-xs text-muted">
          Задачи, созданные с {fmtServerDate(data.from, false)} по {fmtServerDate(data.to, false)}. Отменённые не учитываются.
        </p>
      ) : null}
      {!data && !error ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {data ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="p-3 font-medium">Сотрудник</th>
                  <th className="p-3 text-right font-medium">Всего</th>
                  <th className="p-3 text-right font-medium">Выполнено</th>
                  <th className="p-3 text-right font-medium">В работе</th>
                  <th className="p-3 text-right font-medium">Просрочено</th>
                  <th className="p-3 text-right font-medium">Ср. время</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr key={r.user_id} className="border-b border-border last:border-0">
                    <td className="p-3 font-medium">{r.name}</td>
                    <td className="tabular p-3 text-right">{r.total}</td>
                    <td className="tabular p-3 text-right text-success">{r.done}</td>
                    <td className="tabular p-3 text-right">{r.in_progress}</td>
                    <td className={`tabular p-3 text-right ${r.overdue > 0 ? 'text-danger' : ''}`}>{r.overdue}</td>
                    <td className="tabular p-3 text-right">{fmtHours(r.avg_hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card className="p-4">
            <div className="mb-1 text-sm font-medium">Рейтинг скорости</div>
            <div className="mb-4 text-xs text-muted">Среднее время от создания до выполнения — чем короче, тем выше</div>
            {ranked.length === 0 ? <div className="text-sm text-muted">За период нет выполненных задач.</div> : null}
            <ol className="grid gap-3">
              {ranked.map((r, i) => (
                <li key={r.user_id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                  <span className="tabular text-muted">{i + 1}</span>
                  <div className="min-w-0">
                    <div className="truncate">{r.name}</div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-bg">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(4, ((r.avg_hours ?? 0) / maxAvg) * 100)}%`, background: 'var(--color-accent)' }}
                      />
                    </div>
                  </div>
                  <span className="tabular text-xs text-muted">{fmtHours(r.avg_hours)} · {r.done}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : null}
    </AppShell>
  )
}
