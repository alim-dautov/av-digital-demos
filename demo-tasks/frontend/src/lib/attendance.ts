// Pure helpers for «Посещаемость» (no imports so node tests can compile this file alone).

export type AttendanceShift = { id: number; in_local: string; out_local: string | null; status: 'open' | 'closed' | 'incomplete'; edit_comment?: string | null; rev: string }
export type AttendanceDay = {
  work_date: string
  status: 'complete' | 'incomplete'
  raw_seconds: number
  lunch_seconds: number
  worked_seconds: number | null
  shifts: AttendanceShift[]
}
export type AttendanceMine = { period: string; days: AttendanceDay[] }
export type DayCode = { user_id: number; work_date: string; code: string; rev: string }
export type CodeRev = { user_id: number; work_date: string; rev: string }
export type AttendanceReport = {
  period: string
  days_in_month: number
  /** Authoritative roster, the same as the XLSX: includes code-only (e.g. deleted) employees with empty `days`. */
  employees: { user_id: number; name: string; position?: string; days: AttendanceDay[]; worked_seconds: number; incomplete_days: number }[]
  /** Days that currently carry a code: render these. */
  codes?: DayCode[]
  /** Optimistic token for every day that ever had a code, incl. cleared ones. The only source of `rev`. */
  code_revs?: CodeRev[]
  conflicts?: { user_id: number; work_date: string }[]
  can_edit_shifts?: boolean
}
export type ArchiveItem = { id: number; period: string; revision: number; kind: 'auto' | 'manual'; status: 'pending' | 'ready' | 'failed'; size: number | null; employees: number | null; incomplete_days: number | null; conflicts: number | null; error: string | null; created_at: string }
export type CheckResult = { ok: true; kind: 'in' | 'out'; at_local: string; work_date: string; duplicate: boolean; shift_id: number }
export type DisplayCurrent = { token: string; epoch: number; ms_left: number; name: string }
export type DisplayItem = { id: number; name: string; user_id: number; username: string; is_active: boolean; created_at: string; revoked_at: string | null }

/** null → «не рассчитано» (never shown as a fake 0). */
export function formatHours(seconds: number | null): string {
  if (seconds === null) return 'не рассчитано'
  const m = Math.floor(seconds / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function dayLabel(day: Pick<AttendanceDay, 'status' | 'worked_seconds'>): string {
  return day.worked_seconds === null ? 'не завершён' : formatHours(day.worked_seconds)
}

const ERRORS: Record<string, string> = {
  qr_expired_retry: 'QR обновился — отсканируйте ещё раз',
  qr_invalid: 'QR недействителен',
  open_shift_exists: 'Предыдущая смена не закрыта',
  stale_open_shift: 'Прошлая смена не закрыта. Отметьте «Приход» — прошлую смену исправит владелец',
  stale_form: 'Смена уже изменилась. Обновите табель',
  shift_overlap: 'Отметка пересекается с другой сменой — не записана, обратитесь к владельцу',
  no_open_shift: 'Нет открытого прихода',
  already_marked_this_qr: 'По этому QR уже есть отметка — дождитесь нового',
  busy_retry: 'Повторите через секунду',
}

export function checkErrorText(code: string): string {
  return ERRORS[code] ?? 'Не удалось отметиться'
}

const TOKEN_RE = /^\d{1,10}\.\d{1,12}\.[A-Za-z0-9_-]{22}$/

/** Token from the QR text: bare token or a link with ?t=. Anything else is rejected. */
export function extractToken(text: string): string | null {
  const raw = text.trim()
  if (TOKEN_RE.test(raw)) return raw
  const m = /[?&#]t=([^&#\s]+)/.exec(raw)
  if (!m) return null
  const t = decodeURIComponent(m[1])
  return TOKEN_RE.test(t) ? t : null
}

export const timeOf = (local: string | null) => (local ? local.slice(11, 16) : '—')

/** What the office screen encodes: a same-origin link; the token sits in the fragment so it never reaches server logs or Referer. */
export function qrUrl(origin: string, token: string): string {
  return `${origin}/attendance#t=${token}`
}

/** Token from the link the phone camera opened (fragment, or a ?t= for old links). */
export function tokenFromLocation(hash: string, search: string): string | null {
  for (const part of [hash, search]) {
    const m = /[?&#]t=([^&#\s]+)/.exec(part)
    if (m) return extractToken(decodeURIComponent(m[1]))
  }
  return null
}

export function monthSummary(days: Pick<AttendanceDay, 'status' | 'worked_seconds'>[]): { worked: number; incompleteDays: number } {
  let worked = 0
  let incompleteDays = 0
  for (const d of days) {
    if (d.worked_seconds === null) incompleteDays++
    else worked += d.worked_seconds
  }
  return { worked, incompleteDays }
}

export function monthTotalText(days: Pick<AttendanceDay, 'status' | 'worked_seconds'>[]): string {
  const { worked, incompleteDays } = monthSummary(days)
  return incompleteDays ? `${formatHours(worked)} + не завершено дней: ${incompleteDays}` : formatHours(worked)
}

/** The open shift started on an earlier working day than today (local). */
export function isStaleOpen(openSinceLocal: string, todayYmd: string): boolean {
  return openSinceLocal.slice(0, 10) < todayYmd
}

/* ---------- monthly timesheet (customer template) ---------- */

export const TIMESHEET_CODES = ['Б', 'О', 'А', 'К', 'П', 'Р', 'Д', 'В'] as const
export const INCOMPLETE = 'НЗ'
export type CellTone = 'hours' | 'code' | 'warn' | 'conflict' | 'empty'
export type CellValue = number | string | undefined

export function cellView(v: CellValue | null, conflict: boolean): { text: string; tone: CellTone } {
  if (v === undefined || v === null || v === '') return { text: '', tone: 'empty' }
  if (conflict) return { text: `${v}*`, tone: 'conflict' }
  if (typeof v === 'number') return { text: String(v), tone: 'hours' }
  if (v === INCOMPLETE) return { text: v, tone: 'warn' }
  return { text: v, tone: 'code' }
}

/** Server worked seconds (lunch already deducted once per closed day) → hours rounded to 0.01. */
export function hoursOf(seconds: number | null): number | null {
  if (seconds === null) return null
  return Math.round(seconds / 36) / 100
}

export type GridCell = { day: number; date: string; value: CellValue; conflict: boolean }
export type GridRow = { user_id: number; name: string; cells: GridCell[]; hours: number }

/** Same rules as the XLSX: a code wins over hours (conflict marked), open day = НЗ, nothing invented (never «В»). */
export function buildGrid(r: AttendanceReport): { days: number; rows: GridRow[] } {
  const days = r.days_in_month
  const codes = new Map((r.codes ?? []).map((c) => [`${c.user_id}|${c.work_date}`, c.code]))
  const conflicts = new Set((r.conflicts ?? []).map((c) => `${c.user_id}|${c.work_date}`))
  const rows = r.employees.map((e) => {
    const byDate = new Map(e.days.map((d) => [d.work_date, d]))
    let total = 0
    const cells: GridCell[] = []
    for (let n = 1; n <= days; n++) {
      const date = `${r.period}-${String(n).padStart(2, '0')}`
      const key = `${e.user_id}|${date}`
      const d = byDate.get(date)
      const code = codes.get(key)
      let value: CellValue
      if (code !== undefined) value = code
      else if (d) value = d.worked_seconds === null ? INCOMPLETE : (hoursOf(d.worked_seconds) as number)
      if (typeof value === 'number') total += value
      cells.push({ day: n, date, value, conflict: code !== undefined && conflicts.has(key) })
    }
    return { user_id: e.user_id, name: e.name, cells, hours: Math.round(total * 100) / 100 }
  })
  return { days, rows }
}

/** `rev` for setCode: from code_revs (incl. cleared tombstones), 'none' only if the day never had a code. */
export function tokenFor(r: Pick<AttendanceReport, 'code_revs'>, userId: number, date: string): string {
  return (r.code_revs ?? []).find((x) => x.user_id === userId && x.work_date === date)?.rev ?? 'none'
}

/** day_has_marks → ask explicitly, then retry with confirm_conflict; stale_code → reload and let the user decide again. */
export function codeErrorAction(e: { status?: number; code?: string }): 'confirm' | 'stale' | 'error' {
  if (e.status === 409 && e.code === 'day_has_marks') return 'confirm'
  if (e.status === 409 && e.code === 'stale_code') return 'stale'
  return 'error'
}

/** Manual revision: a closed or the current month (server also enforces timesheet_archive_from). */
export function canSaveRevision(period: string, currentMonth: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentMonth
}

export function attention(r: AttendanceReport | null, failedPeriods: string[]): { conflicts: number; incomplete: number; failedPeriods: string[] } {
  if (!r) return { conflicts: 0, incomplete: 0, failedPeriods: [...failedPeriods] }
  const incomplete = buildGrid(r).rows.reduce((n, row) => n + row.cells.filter((c) => c.value === INCOMPLETE).length, 0)
  return { conflicts: (r.conflicts ?? []).length, incomplete, failedPeriods: [...failedPeriods] }
}

/** Exact legend wording of the customer template (sharedStrings «Условные обозначения»). */
export const CODE_LEGEND: Record<(typeof TIMESHEET_CODES)[number], string> = {
  Б: 'временная нетрудоспособность (болезнь и т.п.)',
  О: 'отпуск трудовой',
  А: 'отпуск без сохранения заработной платы',
  К: 'служебные командировки',
  П: 'прогул',
  Р: 'отпуск по беременности и родам',
  Д: 'отпуск по уходу за ребенком до достижения им возраста 3х лет',
  В: 'выходные и праздничные дни',
}

/* ---------- request lifecycle: every response is tagged with (gen, period) and accepted only if still current ---------- */

export type ShiftDraft = { shift?: AttendanceShift; userId?: number; name: string; inLocal: string; outLocal: string; comment: string }
export type TsEditor = { id: number; draft: ShiftDraft }
export type TsPicker = { id: number; userId: number; name: string; date: string; comment: string }
export type TsState = { period: string; gen: number; /** bumps on every month switch (A->B->A gives a new cycle) */ cycle: number; pickSeq: number; editSeq: number; editor: TsEditor | null; data: AttendanceReport | null; failed: string[]; error: string | null; picker: TsPicker | null }
export type TsAction =
  | { type: 'period'; period: string }
  | { type: 'reload' }
  | { type: 'loaded'; gen: number; period: string; data: AttendanceReport }
  | { type: 'failedLoaded'; gen: number; period: string; failed: string[] }
  | { type: 'error'; gen: number; period: string; message: string }
  | { type: 'refresh'; token: MutationToken }
  | { type: 'pick'; userId: number; name: string; date: string; period?: string }
  | { type: 'comment'; comment: string }
  | { type: 'close'; token?: MutationToken }
  | { type: 'editOpen'; draft: ShiftDraft }
  | { type: 'editChange'; patch: Partial<ShiftDraft> }
  | { type: 'editClose'; token?: MutationToken }

/** Identity of a mutation started from the UI: lifecycle cycle + picker instance (not just the month). */
export type MutationToken = { cycle: number; pickerId: number | null; editorId?: number | null }
export const timesheetInit = (period: string): TsState => ({ period, gen: 0, cycle: 0, pickSeq: 0, editSeq: 0, editor: null, data: null, failed: [], error: null, picker: null })
export const mutationToken = (s: TsState): MutationToken => ({ cycle: s.cycle, pickerId: s.picker?.id ?? null, editorId: null })
/** Token of a shift-editor save: month cycle + this editor instance (independent of the code picker). */
export const shiftToken = (s: TsState): MutationToken => ({ cycle: s.cycle, pickerId: null, editorId: s.editor?.id ?? null })
/** May a completion (close / confirm prompt / retry / notify) of this mutation still act? Fresh data does not invalidate it. */
export const mutationCurrent = (s: TsState, t: MutationToken): boolean =>
  s.cycle === t.cycle && (t.pickerId === null || s.picker?.id === t.pickerId) && (t.editorId == null || s.editor?.id === t.editorId)

export function timesheetReducer(s: TsState, a: TsAction): TsState {
  const current = (gen: number, period: string) => gen === s.gen && period === s.period
  switch (a.type) {
    case 'period':
      return a.period === s.period ? s : { ...timesheetInit(a.period), gen: s.gen + 1, cycle: s.cycle + 1, pickSeq: s.pickSeq, editSeq: s.editSeq }
    case 'reload':
      return { ...s, gen: s.gen + 1, error: null }
    case 'loaded':
      return current(a.gen, a.period) && a.data.period === a.period ? { ...s, data: a.data, error: null } : s
    case 'failedLoaded':
      return current(a.gen, a.period) ? { ...s, failed: a.failed } : s
    case 'error':
      return current(a.gen, a.period) ? { ...s, error: a.message } : s
    case 'refresh':
      // a mutation's re-read goes through the generation loader, so a newer load is never clobbered
      return s.cycle === a.token.cycle ? { ...s, gen: s.gen + 1 } : s
    case 'pick':
      if (a.period !== undefined && a.period !== s.period) return s
      if (!a.date.startsWith(`${s.period}-`)) return s
      return { ...s, pickSeq: s.pickSeq + 1, picker: { id: s.pickSeq + 1, userId: a.userId, name: a.name, date: a.date, comment: '' } }
    case 'comment':
      return s.picker ? { ...s, picker: { ...s.picker, comment: a.comment } } : s
    case 'close':
      if (a.token && !(mutationCurrent(s, a.token) && a.token.pickerId !== null)) return s
      return { ...s, picker: null }
    case 'editOpen':
      return { ...s, editSeq: s.editSeq + 1, editor: { id: s.editSeq + 1, draft: a.draft } }
    case 'editChange':
      return s.editor ? { ...s, editor: { ...s.editor, draft: { ...s.editor.draft, ...a.patch } } } : s
    case 'editClose':
      if (a.token && !(mutationCurrent(s, a.token) && a.token.editorId != null)) return s
      return { ...s, editor: null }
    default:
      return s
  }
}

type Fetch = <T>(url: string) => Promise<T>

/** Fetches report + archive status for (period, gen); results are dispatched tagged, the reducer drops stale ones. */
export function loadTimesheet(api: Fetch, period: string, gen: number, dispatch: (a: TsAction) => void): void {
  api<AttendanceReport>(`/attendance/admin/report?period=${period}`).then(
    (data) => dispatch({ type: 'loaded', gen, period, data }),
    (e: Error) => dispatch({ type: 'error', gen, period, message: e.message }),
  )
  api<{ failed_periods: string[] }>(`/attendance/admin/archive?period=${period}`).then(
    (r) => dispatch({ type: 'failedLoaded', gen, period, failed: r.failed_periods }),
    () => dispatch({ type: 'failedLoaded', gen, period, failed: [] }),
  )
}

/** The picker cell always comes from the currently accepted data (never a stale copy). */
export function pickerCell(s: TsState): GridCell | null {
  if (!s.picker || !s.data || s.data.period !== s.period) return null
  const row = buildGrid(s.data).rows.find((r) => r.user_id === s.picker?.userId)
  return row?.cells.find((c) => c.date === s.picker?.date) ?? null
}

export type ReqState<T> = { key: string; gen: number; data: T | null; error: string | null }
export type ReqAction<T> = { type: 'key'; key: string } | { type: 'reload' } | { type: 'ok'; gen: number; key: string; data: T } | { type: 'err'; gen: number; key: string; message: string }
export const requestInit = <T>(key: string): ReqState<T> => ({ key, gen: 0, data: null, error: null })

export function requestReducer<T>(s: ReqState<T>, a: ReqAction<T>): ReqState<T> {
  switch (a.type) {
    case 'key':
      return a.key === s.key ? s : { key: a.key, gen: s.gen + 1, data: null, error: null }
    case 'reload':
      return { ...s, gen: s.gen + 1, error: null }
    case 'ok':
      return a.gen === s.gen && a.key === s.key ? { ...s, data: a.data, error: null } : s
    case 'err':
      return a.gen === s.gen && a.key === s.key ? { ...s, error: a.message } : s
  }
}

export function runRequest<T>(fetcher: (key: string) => Promise<T>, key: string, gen: number, dispatch: (a: ReqAction<T>) => void): void {
  fetcher(key).then(
    (data) => dispatch({ type: 'ok', gen, key, data }),
    (e: Error) => dispatch({ type: 'err', gen, key, message: e.message }),
  )
}

export function keeperCandidates<S extends { role: string; deleted: boolean; is_active: boolean; modules: string[] }>(staff: S[]): S[] {
  return staff.filter((s) => s.role === 'employee' && !s.deleted && s.is_active && s.modules.includes('attendance'))
}
