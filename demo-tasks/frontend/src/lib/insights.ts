/** "2026-10-28 21:05:00" (server time, Asia/Almaty) → "28.10.2026 21:05". No timezone shift. */
export function fmtServerDate(value: string | null | undefined, withTime = true): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(value)
  if (!m) return value
  const day = `${m[3]}.${m[2]}.${m[1]}`
  return withTime && m[4] ? `${day} ${m[4]}:${m[5]}` : day
}

export function fmtHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return '—'
  if (hours < 24) return `${hours.toLocaleString('ru-RU')} ч`
  return `${(Math.round((hours / 24) * 10) / 10).toLocaleString('ru-RU')} дн`
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : 'Ошибка'
}

export function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
