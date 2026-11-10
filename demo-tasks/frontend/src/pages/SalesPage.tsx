import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { SourceIcon } from '../components/SourceIcon'
import { DealBoard, type Deal, type DealColumn } from '../components/sales/DealBoard'
import { StageSheet, type PendingMove } from '../components/sales/StageSheet'
import { Button, Drawer, EmptyState, ErrorState, Input, Select, SkeletonRows, Toast } from '../components/ui'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { formatKzt } from '../lib/format'
import { LEAD_SOURCES } from '../lib/sources'

type Board = { columns: DealColumn[] }

function moveInBoard(board: Board, dealId: number, from: string, to: string): Board {
  const deal = board.columns.find((c) => c.slug === from)?.deals.find((d) => d.id === dealId)
  if (!deal) return board
  return {
    columns: board.columns.map((c) => {
      if (c.slug === from) return { ...c, count: c.count - 1, amount: c.amount - deal.amount, deals: c.deals.filter((d) => d.id !== dealId) }
      if (c.slug === to) return { ...c, count: c.count + 1, amount: c.amount + deal.amount, deals: [deal, ...c.deals] }
      return c
    }),
  }
}

type DealDetail = {
  deal: Deal & { loss_reason: string | null; payment_terms: string | null; client_task: string | null }
  items: Array<{ sku: string; name: string; qty: number; price: number; line_total: number }>
  timeline: Array<{ kind: string; body: string; created_at: string }>
  quotes: Array<{ id: number; number: string; version: number; status: string; total: number; sent_at: string | null }>
  orders: Array<{ id: number; number: string; status: string; amount: number; onec_document_id: string | null }>
}

const STAGES = [
  ['contact_made', 'Контакт установлен'],
  ['need_defined', 'Потребность'],
  ['proposal_sent', 'Предложение отправлено'],
  ['negotiation', 'Согласование'],
  ['awaiting_payment', 'Ожидание оплаты'],
  ['won', 'Успешно'],
  ['lost', 'Без продажи'],
] as const

export function SalesPage() {
  const [params, setParams] = useSearchParams()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<DealDetail | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', source: 'instagram', title: '' })
  const [note, setNote] = useState('')
  const [loss, setLoss] = useState('')
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const { can } = useAuth()

  async function load(silent = false) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      setBoard(await api<Board>('/deals'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  function showToast(message: string) {
    window.clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = window.setTimeout(() => setToast(null), 3500)
  }

  const stageName = (slug: string) => board?.columns.find((c) => c.slug === slug)?.name || slug

  async function moveDeal(deal: Deal, from: string, to: string) {
    const before = board
    if (before) setBoard(moveInBoard(before, deal.id, from, to))
    try {
      await api(`/deals/${deal.id}/move`, { method: 'POST', body: JSON.stringify({ stage: to }) })
      showToast(`${deal.number} → «${stageName(to)}»`)
      void load(true)
    } catch (e) {
      if (before) setBoard(before)
      const message = e instanceof Error ? e.message : 'Не удалось перенести сделку'
      if ((e as { status?: number }).status === 422) setPendingMove({ deal, to, toName: stageName(to), error: message })
      else showToast(message)
    }
  }

  async function openDeal(id: number) {
    const data = await api<DealDetail>(`/deals/${id}`)
    setDetail(data)
    setParams({ deal: String(id) })
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    const id = params.get('deal')
    if (id) void openDeal(Number(id)).catch(() => setError('Сделка недоступна'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell title="Продажи" showFilters={false}>
      <div className="page-enter mb-4">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Input aria-label="Имя" placeholder="Имя клиента" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input aria-label="Телефон" placeholder="Телефон" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Select aria-label="Источник" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} icon={(value) => <SourceIcon source={value} />}>
            {LEAD_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button
            onClick={() => {
              void api('/deals', { method: 'POST', body: JSON.stringify(form) })
                .then(() => {
                  setNote('Заявка сохранена')
                  return load()
                })
                .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'))
            }}
          >
            Новая заявка
          </Button>
        </div>
      </div>
      {note ? <p className="mb-3 text-sm text-muted">{note}</p> : null}
      {loading ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!loading && !error && board && board.columns.every((c) => c.count === 0) ? (
        <EmptyState title="Заявок пока нет" description="Создайте первую заявку. Повтор того же телефона свяжется с открытой сделкой." />
      ) : null}
      {board ? (
        <DealBoard
          columns={board.columns}
          canMove={can('sales', 'update')}
          onOpen={(id) => void openDeal(id)}
          onMove={(deal, from, to) => void moveDeal(deal, from, to)}
        />
      ) : null}
      <StageSheet
        pending={pendingMove}
        onClose={() => setPendingMove(null)}
        onOpenDeal={(id) => {
          setPendingMove(null)
          void openDeal(id)
        }}
        onMoved={(move) => {
          setPendingMove(null)
          showToast(`${move.deal.number} → «${move.toName}»`)
          void load(true)
        }}
      />
      <Toast message={toast} />
      <Drawer open={!!detail} title={detail?.deal.number || 'Сделка'} onClose={() => setDetail(null)}>
        {detail ? (
          <div className="grid gap-4 text-sm">
            <p className="font-medium">{detail.deal.title}</p>
            <p className="text-muted">{detail.deal.client_name}</p>
            <label className="grid gap-1">
              Причина отказа
              <Input value={loss} onChange={(e) => setLoss(e.target.value)} aria-label="Причина отказа" />
            </label>
            <div className="flex flex-wrap gap-2">
              {STAGES.map(([slug, label]) => (
                <Button
                  key={slug}
                  variant="outline"
                  onClick={() => {
                    void api(`/deals/${detail.deal.id}/move`, {
                      method: 'POST',
                      body: JSON.stringify({
                        stage: slug,
                        loss_reason: loss,
                      }),
                    })
                      .then(() => Promise.all([openDeal(detail.deal.id), load(true)]))
                      .catch((e) => showToast(e instanceof Error ? e.message : 'Ошибка'))
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                void api(`/deals/${detail.deal.id}/items`, {
                  method: 'POST',
                  body: JSON.stringify({ sku: 'DEMO-D-200', qty: 1, price: 89000, discount_pct: 0 }),
                }).then(() => openDeal(detail.deal.id))
              }}
            >
              Добавить перфоратор из каталога
            </Button>
            <Button
              onClick={() => {
                void api(`/deals/${detail.deal.id}/quotes`, { method: 'POST' }).then(() => openDeal(detail.deal.id))
              }}
            >
              Собрать КП
            </Button>
            {detail.quotes.map((q) => (
              <div key={q.id} className="rounded-[10px] border border-border p-3">
                <div>{q.number} · {q.status} · {formatKzt(q.total)}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a className="min-h-11 inline-flex items-center text-accent" href={`/api/quotes/${q.id}/html`} target="_blank" rel="noreferrer">
                    Предпросмотр
                  </a>
                  {!q.sent_at ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        void api(`/quotes/${q.id}/send`, { method: 'POST', body: JSON.stringify({ via: 'manual' }) }).then(() => openDeal(detail.deal.id))
                      }}
                    >
                      Отметить отправку
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() => {
                void api(`/deals/${detail.deal.id}/onec-order`, {
                  method: 'POST',
                  idempotencyKey: `order-${detail.deal.id}`,
                }).then(() => openDeal(detail.deal.id))
              }}
            >
              Отправить заказ в тестовую 1С
            </Button>
            {detail.orders.map((o) => (
              <p key={o.id} className="text-muted">
                {o.number} · {o.status} · {o.onec_document_id || 'без документа'} · {formatKzt(o.amount)}
              </p>
            ))}
            <h3 className="font-semibold">Хронология</h3>
            {detail.timeline.length === 0 ? <p className="text-muted">Событий нет</p> : null}
            {detail.timeline.map((ev, i) => (
              <p key={i} className="text-muted">
                {ev.kind}: {ev.body}
              </p>
            ))}
          </div>
        ) : null}
      </Drawer>
    </AppShell>
  )
}
