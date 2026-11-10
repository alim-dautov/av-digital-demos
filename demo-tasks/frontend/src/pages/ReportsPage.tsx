import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DateRangePicker } from '../components/DateRangePicker'
import { AppShell } from '../components/layout/AppShell'
import { Card, ErrorState, SkeletonRows } from '../components/ui'
import { api } from '../lib/api'
import { formatKzt } from '../lib/format'
import { localDateKey } from '../lib/tasks'

type Metric = { code: string; label: string; value: number | null; suffix?: string; as_of?: string }
type Report = {
  period: { from: string; to: string }
  updated_at: string
  note: string
  funnel_rule: string
  metrics: Metric[]
}

function show(metric: Metric): string {
  if (metric.value === null) return 'нет данных'
  if (metric.suffix === '%') return `${metric.value} %`
  if (['receipts', 'avg_check', 'cpl', 'sale_cost'].includes(metric.code)) return formatKzt(metric.value)
  return String(metric.value)
}

export function ReportsPage() {
  const navigate = useNavigate()
  const [from, setFrom] = useState(() => localDateKey(new Date()).slice(0, 8) + '01')
  const [to, setTo] = useState(() => localDateKey(new Date()))
  const [data, setData] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Array<{ id: number; title: string; href: string }>>([])

  async function load(nextFrom = from, nextTo = to) {
    setLoading(true)
    setError(null)
    try {
      setData(await api<Report>(`/reports?from=${nextFrom}&to=${nextTo}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell title="Отчёты" showFilters={false}>
      <div className="page-enter mb-4 flex flex-wrap items-center gap-3">
        <DateRangePicker
          value={{ from, to }}
          onChange={(range) => {
            setFrom(range.from)
            setTo(range.to)
            setRows([])
            void load(range.from, range.to)
          }}
        />
      </div>
      {loading ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {data ? (
        <>
          <p className="mb-3 text-xs text-muted">
            Обновлено {new Date(data.updated_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })}. {data.funnel_rule}. {data.note}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.metrics.map((metric) => (
              <button
                key={metric.code}
                type="button"
                className="rounded-[14px] border border-border bg-panel p-4 text-left hover:border-accent"
                onClick={() => {
                  void api<{ rows: Array<{ id: number; title: string; href: string }> }>(
                    `/reports/drill?metric=${metric.code}&from=${from}&to=${to}`,
                  ).then((d) => setRows(d.rows))
                }}
              >
                <div className="text-xs text-muted">{metric.label}</div>
                <div className="mt-2 text-2xl font-semibold tabular text-accent">{show(metric)}</div>
                {metric.as_of ? <div className="mt-1 text-xs text-muted">Срез {metric.as_of}</div> : null}
              </button>
            ))}
          </div>
          {rows.length > 0 ? (
            <Card className="mt-4 p-4">
              <h2 className="mb-2 font-semibold">Исходные записи</h2>
              <ul className="grid gap-2">
                {rows.map((row) => (
                  <li key={row.href}>
                    <button type="button" className="min-h-11 text-left text-sm hover:text-accent" onClick={() => navigate(row.href)}>
                      {row.title}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </AppShell>
  )
}
