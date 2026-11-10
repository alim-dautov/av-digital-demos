import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, EmptyState, ErrorState, SkeletonRows } from '../components/ui'
import { api } from '../lib/api'
import { formatKzt } from '../lib/format'

type Stock = {
  items: Array<{
    sku: string
    name: string
    price: number
    warehouse_code: string
    physical: number
    reserved: number
    available: number
    synced_at: string | null
  }>
  synced_at: string | null
  warning: string | null
  mode: string
}

export function WarehousePage() {
  const [data, setData] = useState<Stock | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setData(await api<Stock>('/warehouse'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <AppShell title="Склад" showFilters={false}>
      <div className="page-enter mb-4">
        <Button
          onClick={() => {
            void api('/integrations/onec/sync', { method: 'POST' }).then(() => load())
          }}
        >
          Обновить из тестовой 1С
        </Button>
      </div>
      {data?.warning ? (
        <Card className="mb-4 border-warning p-4 text-sm text-warning">{data.warning}</Card>
      ) : null}
      {loading ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="Каталог пуст" description="Запустите обмен. Это тестовый файл, не боевая 1С." />
      ) : null}
      <div className="grid gap-3">
        {data?.items.map((item) => (
          <Card key={`${item.sku}-${item.warehouse_code}`} className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
            <div className="col-span-3 min-w-0 sm:col-span-1">
              <div className="font-medium break-words">{item.name}</div>
              <div className="text-xs text-muted">{item.sku} · {item.warehouse_code}</div>
            </div>
            <div className="text-sm tabular">Физ. {item.physical}</div>
            <div className="text-sm tabular">Резерв {item.reserved}</div>
            <div className="text-sm tabular">
              Доступно {item.available}
              <div className="text-xs text-muted">{formatKzt(item.price)}</div>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  )
}
