import { AlertTriangle, Download, LogIn, LogOut, Plus } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { QrScanner } from '../components/attendance/QrScanner'
import { AppShell } from '../components/layout/AppShell'
import { Badge, BottomSheet, Button, Card, EmptyState, ErrorState, Field, Input, Spinner, Textarea, Toast } from '../components/ui'
import { api } from '../lib/api'
import {
  attention,
  buildGrid,
  canSaveRevision,
  cellView,
  checkErrorText,
  codeErrorAction,
  dayLabel,
  TIMESHEET_CODES,
  tokenFor,
  type ArchiveItem,
  type CellTone,
  extractToken,
  formatHours,
  isStaleOpen,
  monthTotalText,
  timeOf,
  tokenFromLocation,
  CODE_LEGEND,
  keeperCandidates,
  loadTimesheet,
  mutationCurrent,
  mutationToken,
  shiftToken,
  type ShiftDraft,
  type MutationToken,
  pickerCell,
  requestInit,
  requestReducer,
  runRequest,
  timesheetInit,
  timesheetReducer,
  type AttendanceDay,
  type AttendanceMine,
  type AttendanceShift,
  type CheckResult,
  type DisplayItem,
} from '../lib/attendance'
import { isCrmAdmin, isRealOwner, useAuth } from '../lib/auth'

type ApiErr = Error & { status?: number; code?: string; open_since_local?: string }
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Qyzylorda' })
const thisMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Qyzylorda' }).slice(0, 7)

function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef(0)
  return [
    msg,
    useCallback((m: string) => {
      setMsg(m)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setMsg(null), 3500)
    }, []),
  ]
}

function DayRow({ day, onEdit }: { day: AttendanceDay; onEdit?: (s: AttendanceShift) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0">
      <span className="w-24 shrink-0 text-muted">{day.work_date}</span>
      <span className="flex flex-1 flex-wrap gap-2">
        {day.shifts.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!onEdit}
            onClick={() => onEdit?.(s)}
            className="rounded-[7px] border border-border px-2 py-0.5 enabled:hover:bg-panel-2"
            title={s.edit_comment ? `Исправлено: ${s.edit_comment}` : undefined}
          >
            {timeOf(s.in_local)}–{s.out_local ? timeOf(s.out_local) : '…'}
            {s.edit_comment ? ' ✎' : ''}
          </button>
        ))}
      </span>
      {day.status === 'incomplete' ? <Badge tone="warning">не завершён</Badge> : <span className="font-medium">{dayLabel(day)}</span>}
    </div>
  )
}

/* ---------- employee: check in / out ---------- */

function CheckPanel({ notify }: { notify: (m: string) => void }) {
  const [kind, setKind] = useState<'in' | 'out' | null>(null)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ since: string; stale: boolean } | null>(null)
  const confirmNew = useRef(false)
  const [done, setDone] = useState<CheckResult | null>(null)
  // Token from the link the phone camera opened. Read once, then removed from the address bar/history.
  const [linkToken, setLinkToken] = useState<string | null>(() => tokenFromLocation(window.location.hash, window.location.search))
  useEffect(() => {
    if (window.location.hash || window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const submit = async (token: string, k: 'in' | 'out', fromLink: boolean) => {
    setBusy(true)
    try {
      const res = await api<CheckResult>('/attendance/check', {
        method: 'POST',
        body: JSON.stringify({ token, kind: k, ...(confirmNew.current ? { confirm_new: true } : {}) }),
      })
      setKind(null)
      setDone(res)
      notify(`${res.kind === 'in' ? 'Приход' : 'Уход'} отмечен в ${timeOf(res.at_local)}`)
    } catch (e) {
      const err = e as ApiErr
      const code = err.code ?? ''
      if (k === 'in' && code === 'open_shift_exists') {
        setKind(null)
        const since = err.open_since_local ?? ''
        setConfirm({ since, stale: since !== '' && isStaleOpen(since, today()) })
      } else if (fromLink) {
        // A link QR is usually older than 6 s by the time of the tap: scan the current one right here.
        setHint(code === 'qr_expired_retry' ? 'QR из ссылки устарел — наведите камеру на экран ещё раз' : checkErrorText(code))
        setKind(k)
      } else {
        setHint(code ? checkErrorText(code) : err.message)
      }
    } finally {
      setBusy(false)
    }
  }

  const open = (k: 'in' | 'out') => {
    confirmNew.current = false
    setHint(null)
    setDone(null)
    if (linkToken) {
      // Explicit choice of «Приход»/«Уход» is required; the link alone never records anything.
      const t = linkToken
      setLinkToken(null)
      void submit(t, k, true)
      return
    }
    setKind(k)
  }

  const onText = async (text: string) => {
    if (!kind || busy) return
    const token = extractToken(text)
    if (!token) {
      setHint('Это не QR посещаемости')
      return
    }
    await submit(token, kind, false)
  }

  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-3">
        <Button className="min-h-16 text-base" onClick={() => open('in')}>
          <LogIn size={20} /> Приход
        </Button>
        <Button variant="outline" className="min-h-16 text-base" onClick={() => open('out')}>
          <LogOut size={20} /> Уход
        </Button>
      </div>
      {linkToken ? <p className="mt-3 text-sm">QR с экрана получен — нажмите «Приход» или «Уход».</p> : null}
      {done ? (
        <p className="mt-3 text-sm text-success">
          {done.kind === 'in' ? 'Приход' : 'Уход'}: {timeOf(done.at_local)} ({done.work_date})
          {done.duplicate ? ' — уже был отмечен' : ''}
        </p>
      ) : null}

      <BottomSheet open={kind !== null} title={kind === 'in' ? 'Отметить приход' : 'Отметить уход'} onClose={() => setKind(null)}>
        <div className="flex flex-col gap-3">
          {kind ? <QrScanner onText={(t) => void onText(t)} paused={busy} /> : null}
          <p className="text-sm text-muted">{busy ? 'Отправка…' : hint ?? 'Наведите камеру на QR на экране в офисе'}</p>
        </div>
      </BottomSheet>

      <BottomSheet open={confirm !== null} title="Прошлая смена не закрыта" onClose={() => setConfirm(null)}>
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Открытый приход с {confirm?.since || '—'}
            {confirm?.stale ? ' (вчера или раньше). Эта смена останется «не завершена» — её исправит владелец.' : ' не закрыт. Он останется «не завершён».'}
          </p>
          <p>Отметить новый приход? Нужно будет отсканировать QR ещё раз.</p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                setConfirm(null)
                setHint(null)
                confirmNew.current = true
                setKind('in')
              }}
            >
              Да, новый приход
            </Button>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Отмена
            </Button>
          </div>
        </div>
      </BottomSheet>
    </Card>
  )
}

function MyMonth({ reloadKey }: { reloadKey: number }) {
  const [period, setPeriod] = useState(thisMonth)
  const [data, setData] = useState<AttendanceMine | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    setError(null)
    api<AttendanceMine>(`/attendance/me?period=${period}`).then(setData, (e: Error) => setError(e.message))
  }, [period])
  useEffect(load, [load, reloadKey])
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Мои отметки</h2>
        <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <Spinner /> : data.days.length === 0 ? (
        <EmptyState title="Нет отметок за месяц" />
      ) : (
        <>
          {data.days.map((d) => <DayRow key={d.work_date} day={d} />)}
          <p className="mt-2 text-sm">Итого (без обеда 1 ч в завершённые дни): <b>{monthTotalText(data.days)}</b></p>
        </>
      )}
    </Card>
  )
}

/* ---------- general timesheet: owner, superadmin or delegated keeper ---------- */

const toInput = (local: string | null) => (local ? local.slice(0, 16).replace(' ', 'T') : '')
const TONE: Record<CellTone, string> = {
  hours: '',
  code: 'font-semibold text-accent',
  warn: 'bg-warning/15 text-warning',
  conflict: 'bg-danger/15 font-semibold text-danger',
  empty: 'text-muted',
}
function Timesheet({ notify, admin }: { notify: (m: string) => void; admin: boolean }) {
  const [st, dispatch] = useReducer(timesheetReducer, undefined, () => timesheetInit(thisMonth()))
  const { period, data, failed, error, picker } = st
  const edit = st.editor?.draft ?? null
  const setEdit = (d: ShiftDraft | null) => dispatch(d ? { type: 'editOpen', draft: d } : { type: 'editClose' })
  const editChange = (patch: Partial<ShiftDraft>) => dispatch({ type: 'editChange', patch })
  const [openUser, setOpenUser] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  // Latest reducer state for async completions; they act only if their mutation token is still current.
  const stRef = useRef(st)
  // Layout effect: synced right after commit, before any imperative callback (confirm/notify) can run.
  useLayoutEffect(() => {
    stRef.current = st
  }, [st])

  useEffect(() => loadTimesheet(api, period, st.gen, dispatch), [period, st.gen])
  const load = useCallback(() => dispatch({ type: 'reload' }), [])

  const canEditShifts = data?.can_edit_shifts === true

  const save = async () => {
    if (!edit) return
    const token = shiftToken(st)
    setSaving(true)
    try {
      const body = { in_local: edit.inLocal, out_local: edit.outLocal || null, comment: edit.comment, ...(edit.shift ? { rev: edit.shift.rev } : {}) }
      if (edit.shift) await api(`/attendance/admin/shifts/${edit.shift.id}`, { method: 'PUT', body: JSON.stringify(body) })
      else await api('/attendance/admin/shifts', { method: 'POST', body: JSON.stringify({ ...body, user_id: edit.userId }) })
      dispatch({ type: 'refresh', token })
      if (mutationCurrent(stRef.current, token)) {
        dispatch({ type: 'editClose', token })
        notify('Сохранено, изменение записано в журнал')
      }
    } catch (e) {
      const err = e as ApiErr
      if (mutationCurrent(stRef.current, token)) {
        notify(err.code === 'stale_form' ? checkErrorText('stale_form') : err.message)
        if (err.code === 'stale_form') dispatch({ type: 'editClose', token })
      }
      if (err.code === 'stale_form') dispatch({ type: 'refresh', token })
    } finally {
      setSaving(false)
    }
  }

  type CodeRun = { token: MutationToken; userId: number; date: string; rev: string; comment: string | null }

  /** Sets or clears (code = null) a day code. Never overwrites silently: conflicts need an explicit yes, stale tokens reload.
   *  Every completion is bound to the run's token (lifecycle cycle + picker instance), not just the month. */
  const setCode = async (code: string | null, confirmConflict = false, prev?: CodeRun) => {
    let run = prev
    if (!run) {
      if (!picker || !data || data.period !== period) return
      run = { token: mutationToken(st), userId: picker.userId, date: picker.date, rev: tokenFor(data, picker.userId, picker.date), comment: picker.comment.trim() || null }
    }
    const r = run
    setSaving(true)
    try {
      await api('/attendance/admin/codes', {
        method: 'PUT',
        body: JSON.stringify({ user_id: r.userId, work_date: r.date, code, comment: r.comment, confirm_conflict: confirmConflict, rev: r.rev }),
      })
      const current = mutationCurrent(stRef.current, r.token)
      dispatch({ type: 'close', token: r.token })
      dispatch({ type: 'refresh', token: r.token })
      if (current) notify(code ? `Код «${code}» сохранён` : 'Код снят')
    } catch (e) {
      const err = e as ApiErr
      const action = codeErrorAction(err)
      if (!mutationCurrent(stRef.current, r.token)) return
      if (action === 'confirm') {
        if (window.confirm('В этот день есть QR-отметки. Поставить код всё равно? Часы этого дня не войдут в итог.') && mutationCurrent(stRef.current, r.token)) {
          setSaving(false)
          await setCode(code, true, r)
          return
        }
      } else if (action === 'stale') {
        // Someone changed this day meanwhile: reload via the generation loader, keep the picker open («Сейчас» updates).
        dispatch({ type: 'refresh', token: r.token })
        notify('Код уже изменили. Проверьте «Сейчас» и выберите ещё раз.')
      } else {
        notify(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  // Only data accepted for the current period is rendered or used for links/edits.
  const shown = data && data.period === period ? data : null
  const grid = shown ? buildGrid(shown) : null
  const cell = pickerCell(st)
  const att = attention(shown, failed)

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Табель</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="month" value={period} onChange={(e) => dispatch({ type: 'period', period: e.target.value })} className="w-40" />
          <a href={`/api/attendance/admin/report/${period}/timesheet`} className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-border px-3 text-sm hover:bg-panel-2">
            <Download size={16} /> Табель по образцу (.xlsx)
          </a>
          {admin ? (
            <a href={`/api/attendance/admin/report/${period}/export`} className="inline-flex min-h-11 items-center gap-2 rounded-[9px] border border-border px-3 text-sm hover:bg-panel-2">
              <Download size={16} /> Подробная выгрузка с отметками
            </a>
          ) : null}
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">Часы = сумма смен − 1 ч обеда за каждый завершённый день (округление 0,01). «НЗ» — день не завершён, часы не считаются. Код со «*» — в этот день есть и код, и QR-отметки. Нажмите на клетку, чтобы поставить или снять код.</p>
      {att.conflicts || att.incomplete || att.failedPeriods.length ? (
        <div className="mb-3 rounded-[9px] border border-warning/40 bg-warning/10 p-3 text-sm" role="status">
          <p className="flex items-center gap-2 font-medium"><AlertTriangle size={16} /> Требует внимания</p>
          <ul className="mt-1 list-disc pl-5">
            {att.conflicts ? <li>Код и QR-отметки в один день: {att.conflicts}</li> : null}
            {att.incomplete ? <li>Незавершённых дней (НЗ): {att.incomplete}</li> : null}
            {att.failedPeriods.length ? <li>Автосохранение табеля не удалось: {att.failedPeriods.join(', ')} — сохраните ревизию вручную во вкладке «Архив табелей»</li> : null}
          </ul>
        </div>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !shown || !grid ? <Spinner /> : grid.rows.length === 0 ? (
        <EmptyState title="Нет сотрудников с доступом «Посещаемость»" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-max border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-panel px-2 py-1 text-left">Сотрудник</th>
                  {grid.rows[0].cells.map((c) => <th key={c.day} className="w-8 px-1 py-1 text-center font-normal text-muted">{c.day}</th>)}
                  <th className="px-2 py-1 text-right">Часы</th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.user_id} className="border-t border-border">
                    <td className="sticky left-0 bg-panel px-2 py-1 font-medium">{row.name}</td>
                    {row.cells.map((c) => {
                      const v = cellView(c.value, c.conflict)
                      return (
                        <td key={c.day} className="p-0">
                          <button
                            type="button"
                            className={`h-8 w-8 rounded-[5px] text-center hover:bg-panel-2 ${TONE[v.tone]}`}
                            aria-label={`${row.name}, ${c.date}: ${v.text || 'пусто'}`}
                            onClick={() => dispatch({ type: 'pick', userId: row.user_id, name: row.name, date: c.date, period })}
                          >
                            {v.text}
                          </button>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1 text-right font-semibold">{row.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Смены по сотрудникам{canEditShifts ? '' : ' (только просмотр)'}</h3>
          {shown.employees.map((emp) => (
            <div key={emp.user_id} className="border-b border-border last:border-0">
              <button type="button" className="flex w-full items-center gap-2 py-3 text-left" onClick={() => setOpenUser(openUser === emp.user_id ? null : emp.user_id)}>
                <span className="flex-1 font-medium">{emp.name}</span>
                <span className="text-sm text-muted">{emp.days.filter((d) => d.status === 'complete').length} дн.</span>
                {emp.incomplete_days > 0 ? <Badge tone="warning">не завершено: {emp.incomplete_days}</Badge> : null}
                <span className="w-16 text-right font-semibold">{formatHours(emp.worked_seconds)}</span>
              </button>
              {openUser === emp.user_id ? (
                <div className="pb-3 pl-2">
                  {emp.days.map((d) => (
                    <DayRow key={d.work_date} day={d} onEdit={canEditShifts ? (s) => setEdit({ shift: s, name: emp.name, inLocal: toInput(s.in_local), outLocal: toInput(s.out_local), comment: '' }) : undefined} />
                  ))}
                  {canEditShifts ? (
                    <Button variant="ghost" className="mt-1" onClick={() => setEdit({ userId: emp.user_id, name: emp.name, inLocal: '', outLocal: '', comment: '' })}>
                      <Plus size={16} /> Добавить смену
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </>
      )}

      <BottomSheet open={picker !== null && cell !== null} title={picker ? `${picker.name} — ${picker.date}` : ''} onClose={() => dispatch({ type: 'close' })}>
        {picker && cell ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Сейчас: {cellView(cell.value, cell.conflict).text || 'пусто'}</p>
            <div className="grid grid-cols-4 gap-2">
              {TIMESHEET_CODES.map((c) => (
                <Button key={c} variant="outline" disabled={saving} onClick={() => void setCode(c)}>{c}</Button>
              ))}
            </div>
            <Field label="Комментарий (необязательно)"><Textarea maxLength={500} value={picker.comment} onChange={(e) => dispatch({ type: 'comment', comment: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button variant="outline" disabled={saving} onClick={() => void setCode(null)}>Снять код</Button>
              <Button variant="ghost" onClick={() => dispatch({ type: 'close' })}>Отмена</Button>
            </div>
            <ul className="text-xs text-muted">
              {TIMESHEET_CODES.map((c) => <li key={c}><b>{c}</b> — {CODE_LEGEND[c]}</li>)}
            </ul>
            <p className="text-xs text-muted">«В» никогда не ставится автоматически.</p>
          </div>
        ) : null}
      </BottomSheet>

      <BottomSheet open={edit !== null} persistent title={edit?.shift ? `Исправить смену — ${edit.name}` : `Новая смена — ${edit?.name ?? ''}`} onClose={() => setEdit(null)}>
        {edit ? (
          <div className="flex flex-col gap-3">
            <Field label="Приход"><Input type="datetime-local" value={edit.inLocal} onChange={(e) => editChange({ inLocal: e.target.value })} /></Field>
            <Field label="Уход (пусто — не завершена)"><Input type="datetime-local" value={edit.outLocal} onChange={(e) => editChange({ outLocal: e.target.value })} /></Field>
            <Field label="Причина исправления (обязательно)"><Textarea value={edit.comment} onChange={(e) => editChange({ comment: e.target.value })} /></Field>
            <div className="flex gap-2">
              <Button disabled={saving || !edit.inLocal || edit.comment.trim().length < 3} onClick={() => void save()}>Сохранить</Button>
              <Button variant="outline" onClick={() => setEdit(null)}>Отмена</Button>
            </div>
          </div>
        ) : null}
      </BottomSheet>
    </Card>
  )
}

/* ---------- archive of saved timesheets ---------- */

const STATUS: Record<ArchiveItem['status'], { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ready: { label: 'сохранён', tone: 'success' },
  pending: { label: 'сохраняется', tone: 'warning' },
  failed: { label: 'ошибка', tone: 'danger' },
}

type ArchiveList = { items: ArchiveItem[]; failed_periods: string[] }

function Archive({ notify }: { notify: (m: string) => void }) {
  const [req, dispatch] = useReducer(requestReducer<ArchiveList>, undefined, () => {
    const d = new Date(`${thisMonth()}-15T00:00:00`)
    d.setMonth(d.getMonth() - 1)
    return requestInit<ArchiveList>(d.toISOString().slice(0, 7))
  })
  const period = req.key
  const setPeriod = (p: string) => dispatch({ type: 'key', key: p })
  const [busy, setBusy] = useState(false)
  useEffect(() => runRequest((p) => api<ArchiveList>(`/attendance/admin/archive?period=${p}`), req.key, req.gen, dispatch), [req.key, req.gen])
  const load = useCallback(() => dispatch({ type: 'reload' }), [])
  const { data, error } = req
  const allowed = canSaveRevision(period, thisMonth())

  const create = async () => {
    setBusy(true)
    try {
      const r = await api<{ revision: number }>('/attendance/admin/archive', { method: 'POST', body: JSON.stringify({ period }) })
      // the response is for `period`; the list reload below is tagged and ignored if the month changed meanwhile
      notify(`Сохранена ревизия r${r.revision}`)
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
      load()
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Архив табелей</h2>
        <div className="flex items-center gap-2">
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          <Button disabled={busy || !allowed} onClick={() => void create()}>Сохранить новую ревизию</Button>
        </div>
      </div>
      <p className="mb-2 text-xs text-muted">
        Табель за прошлый месяц сохраняется автоматически 1-го числа после 00:15. Сохранённые ревизии не меняются и не удаляются; исправления попадают только в новую ревизию.
        {allowed ? '' : ' Будущий месяц сохранить нельзя.'}
      </p>
      {data && data.failed_periods.length ? (
        <p className="mb-2 flex items-center gap-2 text-sm text-danger" role="status"><AlertTriangle size={16} /> Автосохранение не удалось: {data.failed_periods.join(', ')}. Сохраните ревизию вручную.</p>
      ) : null}
      {error ? <ErrorState message={error} onRetry={load} /> : !data ? <Spinner /> : data.items.length === 0 ? (
        <EmptyState title="Ревизий за месяц нет" />
      ) : (
        data.items.map((it) => (
          <div key={it.id} className="flex flex-wrap items-center gap-2 border-b border-border py-2 text-sm last:border-0">
            <span className="w-12 font-semibold">r{it.revision}</span>
            <Badge tone={STATUS[it.status].tone}>{STATUS[it.status].label}</Badge>
            <span className="text-muted">{it.kind === 'auto' ? 'авто' : 'вручную'} · {it.created_at}</span>
            {it.status === 'ready' ? (
              <span className="text-muted">сотрудников {it.employees ?? '—'}, НЗ {it.incomplete_days ?? '—'}, конфликтов {it.conflicts ?? '—'}</span>
            ) : null}
            {it.status === 'failed' && it.error ? <span className="text-danger">{it.error}</span> : null}
            <span className="flex-1" />
            {it.status === 'ready' ? (
              <a href={`/api/attendance/admin/archive/${it.id}/download`} className="inline-flex min-h-9 items-center gap-1 rounded-[9px] border border-border px-2 hover:bg-panel-2"><Download size={14} /> Скачать</a>
            ) : null}
          </div>
        ))
      )}
    </Card>
  )
}

/* ---------- timesheet settings: requisites (admin) and keepers (list admin, toggle real owner only) ---------- */

type StaffLite = { id: number; display_name: string; role: string; deleted: boolean; is_active: boolean; modules: string[] }
type SettingsData = { org_title: string; keepers: { user_id: number; name: string }[]; staff: StaffLite[] }

async function loadSettings(key: string): Promise<SettingsData> {
  const [req, keepers, staff] = await Promise.all([
    api<{ org_title: string }>('/attendance/admin/requisites'),
    api<{ items: { user_id: number; name: string }[] }>('/attendance/admin/keepers'),
    key === 'owner' ? api<{ items: StaffLite[] }>('/staff').then((r) => r.items, () => [] as StaffLite[]) : Promise.resolve([] as StaffLite[]),
  ])
  return { org_title: req.org_title, keepers: keepers.items, staff }
}

function TimesheetSettings({ notify, realOwner }: { notify: (m: string) => void; realOwner: boolean }) {
  // realOwner is fixed per mount (the parent keys this component by it).
  const [req, dispatch] = useReducer(requestReducer<SettingsData>, realOwner ? 'owner' : 'admin', requestInit<SettingsData>)
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => runRequest(loadSettings, req.key, req.gen, dispatch), [req.key, req.gen])
  const load = useCallback(() => dispatch({ type: 'reload' }), [])
  const error = req.error
  const org = draft ?? req.data?.org_title ?? null
  const keepers = req.data?.keepers ?? null
  const staff = req.data?.staff ?? []
  const setOrg = setDraft

  const saveOrg = async () => {
    if (org === null) return
    setBusy(true)
    try {
      const r = await api<{ org_title: string }>('/attendance/admin/requisites', { method: 'PUT', body: JSON.stringify({ org_title: org }) })
      setDraft(r.org_title)
      notify('Реквизиты сохранены')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (id: number, grant: boolean) => {
    setBusy(true)
    try {
      await api(`/attendance/admin/keepers/${id}`, { method: grant ? 'POST' : 'DELETE', body: grant ? '{}' : undefined })
      notify(grant ? 'Право «Табельщик» выдано' : 'Право «Табельщик» снято')
      load()
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const keeperIds = new Set((keepers ?? []).map((k) => k.user_id))
  const candidates = keeperCandidates(staff)

  return (
    <Card className="p-4">
      <h2 className="font-semibold">Настройки табеля</h2>
      {error ? <ErrorState message={error} onRetry={load} /> : null}
      <Field label="Наименование организации (шапка табеля)" className="mt-3">
        <Input maxLength={255} value={org ?? ''} disabled={org === null} onChange={(e) => setOrg(e.target.value)} />
      </Field>
      <Button className="mt-2" disabled={busy || org === null} onClick={() => void saveOrg()}>Сохранить реквизиты</Button>
      <p className="mt-2 text-xs text-muted">Должности сотрудников задаются в «Настройки → Сотрудники».</p>

      <h3 className="mt-5 font-semibold">Табельщики</h3>
      <p className="text-xs text-muted">Табельщик видит общий табель, ставит коды и сохраняет ревизии архива, но не правит QR-отметки. {realOwner ? '' : 'Выдавать и снимать право может только владелец.'}</p>
      {keepers === null ? <Spinner /> : realOwner ? (
        candidates.length === 0 ? <EmptyState title="Нет сотрудников с разделом «Посещаемость»" /> : candidates.map((s) => (
          <div key={s.id} className="flex items-center gap-2 border-b border-border py-2 text-sm last:border-0">
            <span className="flex-1">{s.display_name}</span>
            {keeperIds.has(s.id) ? <Badge tone="success">табельщик</Badge> : null}
            <Button variant="outline" disabled={busy} onClick={() => void toggle(s.id, !keeperIds.has(s.id))}>{keeperIds.has(s.id) ? 'Снять право' : 'Сделать табельщиком'}</Button>
          </div>
        ))
      ) : keepers.length === 0 ? <EmptyState title="Табельщиков нет" /> : keepers.map((k) => (
        <div key={k.user_id} className="border-b border-border py-2 text-sm last:border-0">{k.name}</div>
      ))}
    </Card>
  )
}

/* ---------- owner: QR screens ---------- */

function Displays({ notify }: { notify: (m: string) => void }) {
  const [items, setItems] = useState<DisplayItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<{ name: string; username: string; pw: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api<{ items: DisplayItem[] }>('/attendance/admin/displays').then((r) => setItems(r.items), (e: Error) => setError(e.message))
  }, [])
  useEffect(load, [load])

  const create = async () => {
    if (!form) return
    setSaving(true)
    try {
      await api('/attendance/admin/displays', { method: 'POST', body: JSON.stringify({ name: form.name, username: form.username, password: form.pw }) })
      setForm(null)
      notify('Экран создан. Войдите под этим логином на экране в офисе.')
      load()
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const revoke = async (d: DisplayItem) => {
    if (!window.confirm(`Отключить экран «${d.name}»? Его сессии завершатся, QR перестанет приниматься.`)) return
    try {
      await api(`/attendance/admin/displays/${d.id}/revoke`, { method: 'POST', body: '{}' })
      notify('Экран отключён')
      load()
    } catch (e) {
      notify((e as Error).message)
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Экраны QR</h2>
        <Button variant="outline" onClick={() => setForm({ name: '', username: '', pw: '' })}><Plus size={16} /> Экран</Button>
      </div>
      {error ? <ErrorState message={error} onRetry={load} /> : !items ? <Spinner /> : items.length === 0 ? (
        <EmptyState title="Экранов нет" description="Создайте учётку экрана и войдите под ней на планшете/ТВ в офисе." />
      ) : (
        items.map((d) => (
          <div key={d.id} className="flex items-center gap-2 border-b border-border py-2 text-sm last:border-0">
            <span className="flex-1"><b>{d.name}</b> <span className="text-muted">@{d.username}</span></span>
            {d.is_active ? <Badge tone="success">активен</Badge> : <Badge>отключён</Badge>}
            {d.is_active ? <Button variant="ghost" onClick={() => void revoke(d)}>Отключить</Button> : null}
          </div>
        ))
      )}
      <BottomSheet open={form !== null} persistent title="Новый экран QR" onClose={() => setForm(null)}>
        {form ? (
          <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void create() }}>
            <Field label="Название (например, «Вход офис»)"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Логин экрана"><Input autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Пароль экрана (не менее 8 символов)"><Input type="password" autoComplete="new-password" value={form.pw} onChange={(e) => setForm({ ...form, pw: e.target.value })} /></Field>
            <p className="text-xs text-muted">Учётка видит только QR — без доступа к CRM. Сессия экрана ограничена и отзывается кнопкой «Отключить».</p>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !form.name.trim() || !form.username.trim() || form.pw.length < 8}>Создать</Button>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>Отмена</Button>
            </div>
          </form>
        ) : null}
      </BottomSheet>
    </Card>
  )
}

type Tab = 'me' | 'sheet' | 'archive' | 'screens' | 'settings'

export function AttendancePage() {
  const { user } = useAuth()
  const admin = isCrmAdmin(user)
  const realOwner = isRealOwner(user)
  // Keeper access is not in /me: probe the report (200 = viewer). Admins are viewers by definition. Server enforces everything.
  const [viewer, setViewer] = useState<boolean>(admin)
  useEffect(() => {
    if (admin) return
    let alive = true
    api(`/attendance/admin/report?period=${thisMonth()}`).then(() => alive && setViewer(true), () => alive && setViewer(false))
    return () => { alive = false }
  }, [admin])
  const [tab, setTab] = useState<Tab>('me')
  const [toast, notify] = useToast()
  const [reloadKey, setReloadKey] = useState(0)
  const notifyAndReload = useCallback((m: string) => { notify(m); setReloadKey((k) => k + 1) }, [notify])

  const tabs: [Tab, string][] = [['me', 'Отметка']]
  if (viewer || admin) tabs.push(['sheet', 'Табель'], ['archive', 'Архив табелей'])
  if (admin) tabs.push(['screens', 'Экраны QR'], ['settings', 'Настройки табеля'])
  const active = tabs.some(([k]) => k === tab) ? tab : 'me'

  return (
    <AppShell title="Посещаемость" subtitle="Отметка прихода и ухода по QR">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
        {tabs.length > 1 ? (
          <div className="flex flex-wrap gap-2" role="tablist">
            {tabs.map(([k, l]) => (
              <Button key={k} role="tab" aria-selected={active === k} variant={active === k ? 'primary' : 'outline'} onClick={() => setTab(k)}>{l}</Button>
            ))}
          </div>
        ) : null}
        {active === 'me' ? (
          <>
            <CheckPanel notify={notifyAndReload} />
            <MyMonth reloadKey={reloadKey} />
          </>
        ) : active === 'sheet' ? <Timesheet notify={notify} admin={admin} />
          : active === 'archive' ? <Archive notify={notify} />
          : active === 'screens' ? <Displays notify={notify} />
          : <TimesheetSettings key={realOwner ? 'owner' : 'admin'} notify={notify} realOwner={realOwner} />}
      </div>
      <Toast message={toast} />
    </AppShell>
  )
}
