import { useEffect, useState } from 'react'
import { Button, Card, Input, Textarea } from '../ui'
import { api } from '../../lib/api'
import { currentPeriod, errorText } from '../../lib/insights'
import type { KpiData } from '../../pages/KpiPage'

type Company = { name: string; details: string; phone: string; email: string; site: string }

/** Owner only: company block printed at the top of every КП PDF. */
export function KpCompanySettings() {
  const [c, setC] = useState<Company>({ name: '', details: '', phone: '', email: '', site: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api<Company>('/settings/kp-company').then(setC).catch(() => undefined)
  }, [])

  const set = (k: keyof Company) => (e: { target: { value: string } }) => setC((d) => ({ ...d, [k]: e.target.value }))

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      setC(await api<Company>('/settings/kp-company', { method: 'PUT', body: JSON.stringify(c) }))
      setMsg('Сохранено — новые и обновлённые КП будут с этими реквизитами')
    } catch (e) {
      setMsg(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0 p-5">
      <h2 className="font-semibold">Реквизиты для КП</h2>
      <p className="mt-1 text-sm text-muted">Печатаются в шапке PDF коммерческого предложения.</p>
      <div className="mt-4 grid gap-2">
        <Input value={c.name} onChange={set('name')} placeholder="Название компании" aria-label="Название компании" />
        <Textarea rows={3} value={c.details} onChange={set('details')} placeholder="БИН, адрес, банк, ИИК…" aria-label="Реквизиты" />
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={c.phone} onChange={set('phone')} placeholder="Телефон" aria-label="Телефон компании" />
          <Input value={c.email} onChange={set('email')} placeholder="Email" aria-label="Email компании" />
          <Input value={c.site} onChange={set('site')} placeholder="Сайт" aria-label="Сайт компании" />
        </div>
        <Button className="justify-self-start" disabled={busy} onClick={() => void save()}>Сохранить</Button>
      </div>
      {msg ? <p className="mt-2 text-sm text-muted">{msg}</p> : null}
    </Card>
  )
}

/** Owner only: plan / fact per employee for a month. */
export function KpiSettings() {
  const [period, setPeriod] = useState(currentPeriod())
  const [rows, setRows] = useState<Array<{ user_id: number; name: string; plan: string; fact: string }>>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api<KpiData>(`/kpi?period=${period}`)
      .then((d) =>
        setRows(d.items.map((r) => ({ user_id: r.user_id, name: r.name, plan: r.plan === null ? '' : String(r.plan), fact: r.fact === null ? '' : String(r.fact) }))),
      )
      .catch((e) => setMsg(errorText(e)))
  }, [period])

  const edit = (i: number, key: 'plan' | 'fact', value: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)))

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      await api('/kpi/targets', {
        method: 'PUT',
        body: JSON.stringify({ period, items: rows.filter((r) => r.plan !== '' || r.fact !== '').map((r) => ({ user_id: r.user_id, plan: r.plan, fact: r.fact })) }),
      })
      setMsg('KPI сохранены')
    } catch (e) {
      setMsg(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">KPI сотрудников</h2>
          <p className="mt-1 text-sm text-muted">План и факт за месяц. Процент считается как факт / план.</p>
        </div>
        <Input type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} className="w-44" aria-label="Месяц" />
      </div>
      <div className="mt-4 grid gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_96px] gap-2 text-xs text-muted sm:grid-cols-[minmax(0,1fr)_160px_160px]">
          <span>Сотрудник</span><span>План</span><span>Факт</span>
        </div>
        {rows.map((r, i) => (
          <div key={r.user_id} className="grid grid-cols-[minmax(0,1fr)_96px_96px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_160px_160px]">
            <span className="truncate text-sm">{r.name}</span>
            <Input inputMode="decimal" value={r.plan} onChange={(e) => edit(i, 'plan', e.target.value)} aria-label={`План ${r.name}`} />
            <Input inputMode="decimal" value={r.fact} onChange={(e) => edit(i, 'fact', e.target.value)} aria-label={`Факт ${r.name}`} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={() => void save()}>Сохранить KPI</Button>
        {msg ? <span className="text-sm text-muted">{msg}</span> : null}
      </div>
    </Card>
  )
}
