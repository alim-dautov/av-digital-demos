import { Download, Eye, FileText, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Badge, Button, Card, Drawer, EmptyState, ErrorState, Field, Input, SkeletonRows, Textarea } from '../components/ui'
import { api } from '../lib/api'
import { formatKzt } from '../lib/format'
import { errorText, fmtServerDate } from '../lib/insights'

export type KpItem = { name: string; qty: number; unit: string; price: number; sum: number }

export type Kp = {
  id: number
  number: string
  client_name: string
  client_phone: string
  client_company: string
  items: KpItem[]
  discount_type: 'percent' | 'amount' | null
  discount_value: number | null
  notes: string
  valid_until: string | null
  pdf_generated: boolean
  amount: number
  details: string
  pdf_url: string | null
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  status_label: string
  author: string
  created_at: string
  updated_at: string
}

type KpList = { items: Kp[]; statuses: Record<string, string> }

const TONES: Record<Kp['status'], 'muted' | 'info' | 'success' | 'danger'> = {
  draft: 'muted',
  sent: 'info',
  accepted: 'success',
  rejected: 'danger',
}

const STATUS_OPTIONS: Array<[Kp['status'], string]> = [
  ['draft', 'Черновик'],
  ['sent', 'Отправлено'],
  ['accepted', 'Принято'],
  ['rejected', 'Отклонено'],
]

type Row = { name: string; qty: string; unit: string; price: string }
type Draft = {
  client_name: string
  client_phone: string
  client_company: string
  rows: Row[]
  discount_type: 'percent' | 'amount'
  discount_value: string
  notes: string
  valid_until: string
  status: Kp['status']
  amount: string
  details: string
  pdf_url: string
}

const EMPTY_ROW: Row = { name: '', qty: '1', unit: 'шт', price: '' }

function in30Days(): string {
  const d = new Date(Date.now() + 30 * 86400000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function num(v: string): number {
  const n = Number(v.replace(/[\s\u00a0]/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Same rules as the server (KpTotals): row = qty × price, total = subtotal − discount, not below 0. */
export function kpTotals(rows: Row[], type: 'percent' | 'amount', value: string) {
  const subtotal = Math.round(rows.reduce((s, r) => s + Math.round(num(r.qty) * num(r.price) * 100) / 100, 0) * 100) / 100
  const v = num(value)
  const discount = v > 0 ? Math.min(subtotal, Math.round((type === 'percent' ? (subtotal * Math.min(v, 100)) / 100 : v) * 100) / 100) : 0
  return { subtotal, discount, total: Math.max(0, Math.round((subtotal - discount) * 100) / 100) }
}

function toDraft(kp: Kp | null): Draft {
  if (!kp) {
    return {
      client_name: '', client_phone: '', client_company: '', rows: [{ ...EMPTY_ROW }], discount_type: 'percent', discount_value: '',
      notes: '', valid_until: in30Days(), status: 'draft', amount: '', details: '', pdf_url: '',
    }
  }
  return {
    client_name: kp.client_name,
    client_phone: kp.client_phone,
    client_company: kp.client_company,
    rows: kp.items.map((i) => ({ name: i.name, qty: String(i.qty), unit: i.unit, price: String(i.price) })),
    discount_type: kp.discount_type ?? 'percent',
    discount_value: kp.discount_value ? String(kp.discount_value) : '',
    notes: kp.notes,
    valid_until: kp.valid_until ?? '',
    status: kp.status,
    amount: String(kp.amount),
    details: kp.details,
    pdf_url: kp.items.length === 0 ? kp.pdf_url ?? '' : '',
  }
}

export function KpPage() {
  const [data, setData] = useState<KpList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('')
  const [open, setOpen] = useState<Kp | 'new' | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api<KpList>('/kp' + (filter ? `?status=${filter}` : '')))
    } catch (e) {
      setError(errorText(e))
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AppShell title="КП" subtitle="Коммерческие предложения" showFilters={false}>
      <div className="page-enter mb-4 flex flex-wrap items-center gap-2">
        <Button onClick={() => setOpen('new')}>
          <Plus size={16} /> Создать КП
        </Button>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {[['', 'Все'] as const, ...STATUS_OPTIONS].map(([key, label]) => (
          <button
            key={key || 'all'}
            onClick={() => setFilter(key)}
            className={`min-h-9 shrink-0 rounded-full border px-3 text-sm ${filter === key ? 'border-accent text-accent' : 'border-border text-muted hover:text-text'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {!data && !error ? <SkeletonRows /> : null}
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {data && data.items.length === 0 ? (
        <EmptyState title="КП пока нет" description="Нажмите «Создать КП» — CRM соберёт PDF. Также можно через API /api/kp (ключ с доступом «КП»)." />
      ) : null}
      {data && data.items.length > 0 ? (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="p-3 font-medium">№</th>
                  <th className="p-3 font-medium">Клиент</th>
                  <th className="p-3 text-right font-medium">Сумма</th>
                  <th className="p-3 font-medium">Дата</th>
                  <th className="p-3 font-medium">Статус</th>
                  <th className="p-3 font-medium">Автор</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((kp) => (
                  <tr key={kp.id} onClick={() => setOpen(kp)} className="cursor-pointer border-b border-border last:border-0 hover:bg-panel-2">
                    <td className="whitespace-nowrap p-3 text-muted">{kp.number}</td>
                    <td className="p-3 font-medium">{kp.client_name}{kp.client_company ? <span className="text-muted"> · {kp.client_company}</span> : null}</td>
                    <td className="tabular p-3 text-right">{formatKzt(kp.amount)}</td>
                    <td className="p-3 text-muted">{fmtServerDate(kp.created_at)}</td>
                    <td className="p-3"><Badge tone={TONES[kp.status]}>{kp.status_label}</Badge></td>
                    <td className="p-3 text-muted">{kp.author}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="grid gap-3 md:hidden">
            {data.items.map((kp) => (
              <button key={kp.id} onClick={() => setOpen(kp)} className="rounded-[14px] border border-border bg-panel p-4 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 break-words font-medium">
                    {kp.client_name}
                    {kp.client_company ? <div className="text-sm font-normal text-muted">{kp.client_company}</div> : null}
                  </div>
                  <Badge tone={TONES[kp.status]}>{kp.status_label}</Badge>
                </div>
                <div className="tabular mt-1 text-lg">{formatKzt(kp.amount)}</div>
                <div className="mt-1 text-xs text-muted">{kp.number} · {fmtServerDate(kp.created_at)} · {kp.author}</div>
              </button>
            ))}
          </div>
        </>
      ) : null}
      <Drawer open={open !== null} title={open === 'new' ? 'Создать КП' : `КП ${open?.number ?? ''}`} onClose={() => setOpen(null)}>
        {open !== null ? (
          <KpForm
            key={open === 'new' ? 'new' : open.id}
            kp={open === 'new' ? null : open}
            onSaved={(saved) => {
              setOpen(saved)
              void load()
            }}
          />
        ) : null}
      </Drawer>
    </AppShell>
  )
}

function KpForm({ kp, onSaved }: { kp: Kp | null; onSaved: (kp: Kp) => void }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(kp))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const legacy = kp !== null && kp.items.length === 0
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }))
  const setRow = (i: number, k: keyof Row, v: string) => setDraft((d) => ({ ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }))
  const filled = draft.rows.filter((r) => r.name.trim() !== '')
  const totals = useMemo(() => kpTotals(filled, draft.discount_type, draft.discount_value), [filled, draft.discount_type, draft.discount_value])
  const useItems = filled.length > 0
  const canSave = draft.client_name.trim() !== '' && (useItems || legacy)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const base = {
        client_name: draft.client_name,
        client_phone: draft.client_phone,
        client_company: draft.client_company,
        notes: draft.notes,
        valid_until: draft.valid_until || null,
        status: draft.status,
      }
      const body = JSON.stringify(
        useItems
          ? {
              ...base,
              items: filled.map((r) => ({ name: r.name.trim(), qty: num(r.qty), unit: r.unit.trim() || 'шт', price: num(r.price) })),
              discount_type: draft.discount_type,
              discount_value: num(draft.discount_value) > 0 ? num(draft.discount_value) : null,
            }
          : { ...base, amount: draft.amount, details: draft.details, pdf_url: draft.pdf_url.trim() || null },
      )
      const saved = kp ? await api<Kp>(`/kp/${kp.id}`, { method: 'PATCH', body }) : await api<Kp>('/kp', { method: 'POST', body })
      onSaved(saved)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-4">
      {kp ? (
        <div className="grid gap-2 rounded-[12px] border border-border bg-panel-2 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium"><FileText size={16} /> {kp.number} · {formatKzt(kp.amount)}</div>
          <div className="text-xs text-muted">Создано {fmtServerDate(kp.created_at)} · автор: {kp.author}</div>
          {kp.pdf_generated ? (
            <div className="flex flex-wrap gap-2">
              <a href={`/api/kp/${kp.id}/pdf`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-[9px] bg-accent px-3 font-medium text-white">
                <Eye size={16} /> Просмотр PDF
              </a>
              <a href={`/api/kp/${kp.id}/pdf?download=1`} className="inline-flex min-h-10 items-center gap-2 rounded-[9px] border border-border px-3 font-medium hover:bg-panel">
                <Download size={16} /> Скачать
              </a>
            </div>
          ) : kp.pdf_url ? (
            <a href={kp.pdf_url} target="_blank" rel="noopener noreferrer" className="break-all text-accent">Открыть PDF (внешняя ссылка)</a>
          ) : (
            <div className="text-xs text-muted">PDF нет — добавьте позиции и сохраните, CRM сформирует его.</div>
          )}
        </div>
      ) : null}
      <Field label="Клиент"><Input value={draft.client_name} onChange={set('client_name')} placeholder="Имя или контактное лицо" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Компания (необязательно)"><Input value={draft.client_company} onChange={set('client_company')} placeholder="ТОО «Пример»" /></Field>
        <Field label="Телефон (необязательно)"><Input inputMode="tel" value={draft.client_phone} onChange={set('client_phone')} placeholder="+7 7__ ___ __ __" /></Field>
      </div>

      <div className="grid min-w-0 gap-2">
        <div className="text-sm font-medium">Позиции</div>
        {draft.rows.map((r, i) => (
          <div key={i} className="grid min-w-0 gap-2 rounded-[12px] border border-border p-3">
            <div className="flex min-w-0 gap-2">
              <Input className="min-w-0 flex-1" value={r.name} onChange={(e) => setRow(i, 'name', e.target.value)} placeholder="Наименование" aria-label={`Позиция ${i + 1}: наименование`} />
              <button
                type="button"
                aria-label={`Удалить позицию ${i + 1}`}
                onClick={() => setDraft((d) => ({ ...d, rows: d.rows.length > 1 ? d.rows.filter((_, j) => j !== i) : [{ ...EMPTY_ROW }] }))}
                className="grid min-h-11 w-11 shrink-0 place-items-center rounded-[9px] border border-border text-muted hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="grid grid-cols-[1fr_1fr_1.6fr] gap-2">
              <Input inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} placeholder="Кол-во" aria-label={`Позиция ${i + 1}: количество`} />
              <Input value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} placeholder="Ед." aria-label={`Позиция ${i + 1}: единица`} />
              <Input inputMode="decimal" value={r.price} onChange={(e) => setRow(i, 'price', e.target.value)} placeholder="Цена, ₸" aria-label={`Позиция ${i + 1}: цена`} />
            </div>
            <div className="tabular text-right text-sm text-muted">Сумма: <span className="text-text">{formatKzt(Math.round(num(r.qty) * num(r.price) * 100) / 100)}</span></div>
          </div>
        ))}
        <Button variant="outline" onClick={() => setDraft((d) => ({ ...d, rows: [...d.rows, { ...EMPTY_ROW }] }))}>
          <Plus size={16} /> Добавить позицию
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <Field label="Скидка (необязательно)"><Input inputMode="decimal" value={draft.discount_value} onChange={set('discount_value')} placeholder="0" /></Field>
        <select value={draft.discount_type} onChange={set('discount_type')} aria-label="Тип скидки" className="min-h-11 rounded-[9px] border border-border bg-panel px-3 text-sm">
          <option value="percent">%</option>
          <option value="amount">₸</option>
        </select>
      </div>
      <div className="tabular grid gap-1 rounded-[12px] bg-panel-2 p-3 text-sm">
        {totals.discount > 0 ? (
          <>
            <div className="flex justify-between"><span className="text-muted">Сумма</span><span>{formatKzt(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted">Скидка</span><span>− {formatKzt(totals.discount)}</span></div>
          </>
        ) : null}
        <div className="flex justify-between text-base font-semibold"><span>Итого</span><span>{formatKzt(useItems ? totals.total : num(draft.amount))}</span></div>
      </div>

      <Field label="Условия и примечания"><Textarea rows={4} value={draft.notes} onChange={set('notes')} placeholder="Оплата, сроки поставки, гарантия" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Действительно до"><Input type="date" value={draft.valid_until} onChange={set('valid_until')} /></Field>
        <Field label="Статус">
          <select value={draft.status} onChange={set('status')} className="min-h-11 w-full rounded-[9px] border border-border bg-panel px-3 text-sm">
            {STATUS_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      </div>
      {legacy && !useItems ? (
        <div className="grid gap-4 rounded-[12px] border border-dashed border-border p-3">
          <div className="text-xs text-muted">КП создано без позиций. Можно поправить старые поля или добавить позиции — тогда CRM сформирует PDF.</div>
          <Field label="Сумма, ₸"><Input inputMode="decimal" value={draft.amount} onChange={set('amount')} /></Field>
          <Field label="Детали"><Textarea rows={3} value={draft.details} onChange={set('details')} /></Field>
          <Field label="Ссылка на PDF"><Input value={draft.pdf_url} onChange={set('pdf_url')} placeholder="https://…" /></Field>
        </div>
      ) : null}
      {error ? <div className="text-sm text-danger">{error}</div> : null}
      <Button disabled={busy || !canSave} onClick={() => void save()}>
        {busy ? 'Формируем PDF…' : kp ? 'Сохранить и обновить PDF' : 'Сформировать КП'}
      </Button>
    </div>
  )
}
