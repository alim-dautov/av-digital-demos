import clsx from 'clsx'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { localDateKey } from '../lib/tasks'
import { useMediaQuery } from '../lib/useMediaQuery'
import { BottomSheet, Button } from './ui'

type Range = { from: string; to: string }

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const GAP = 6
const PANEL_WIDTH = 520
const monthTitle = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' })
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const shortDate = (d: Date) => `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
const shortDateYear = (d: Date) => `${shortDate(d)} ${d.getFullYear()}`

const toKey = localDateKey

function fromKey(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(d: Date, days: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

function presets(): Array<{ label: string; range: Range }> {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const key = toKey(today)
  return [
    { label: 'Сегодня', range: { from: key, to: key } },
    { label: 'Вчера', range: { from: toKey(addDays(today, -1)), to: toKey(addDays(today, -1)) } },
    { label: 'Последние 7 дней', range: { from: toKey(addDays(today, -6)), to: key } },
    { label: 'Последние 30 дней', range: { from: toKey(addDays(today, -29)), to: key } },
    { label: 'Этот месяц', range: { from: toKey(new Date(y, m, 1)), to: key } },
    { label: 'Прошлый месяц', range: { from: toKey(new Date(y, m - 1, 1)), to: toKey(new Date(y, m, 0)) } },
    { label: 'Этот год', range: { from: toKey(new Date(y, 0, 1)), to: key } },
  ]
}

function formatRange({ from, to }: Range) {
  const a = fromKey(from)
  const b = fromKey(to)
  if (from === to) return shortDateYear(a)
  const sameYear = a.getFullYear() === b.getFullYear()
  return `${(sameYear ? shortDate : shortDateYear)(a)} — ${shortDateYear(b)}`
}

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => addDays(first, i - offset))
}

function Calendar({ value, onPick }: { value: Range; onPick: (range: Range) => void }) {
  const [month, setMonth] = useState(() => {
    const d = fromKey(value.to)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [start, setStart] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [todayKey] = useState(() => toKey(new Date()))

  const [lo, hi] = start ? [start, hover || start].sort() : [value.from, value.to]
  const shift = (delta: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1))
  const nextDisabled = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 1)) > todayKey

  function pick(key: string) {
    if (!start) {
      setStart(key)
      return
    }
    const [from, to] = [start, key].sort()
    setStart(null)
    setHover(null)
    onPick({ from, to })
  }

  return (
    <div className="w-full min-w-0 select-none sm:w-[300px]">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shift(-1)} aria-label="Предыдущий месяц" className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-panel-2 hover:text-text">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize" aria-live="polite">
          {monthTitle.format(month).replace(' г.', '')}
        </span>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={nextDisabled}
          aria-label="Следующий месяц"
          className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-panel-2 hover:text-text disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1.5">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5" onPointerLeave={() => setHover(null)}>
        {monthDays(month).map((day) => {
          const key = toKey(day)
          const outside = day.getMonth() !== month.getMonth()
          const future = key > todayKey
          const inRange = key >= lo && key <= hi
          const edgeStart = key === lo
          const edgeEnd = key === hi
          return (
            <div
              key={key}
              className={clsx(
                'flex h-10 items-center justify-center',
                inRange && !(edgeStart && edgeEnd) && 'bg-accent-soft',
                inRange && edgeStart && 'rounded-l-full',
                inRange && edgeEnd && 'rounded-r-full',
              )}
            >
              <button
                type="button"
                disabled={future}
                aria-label={day.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                aria-pressed={edgeStart || edgeEnd}
                onClick={() => pick(key)}
                onPointerEnter={() => start && setHover(key)}
                className={clsx(
                  'tabular relative flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                  edgeStart || edgeEnd ? 'bg-accent font-semibold text-white' : inRange ? 'text-text' : outside ? 'text-muted/50' : 'text-text',
                  !(edgeStart || edgeEnd) && !future && 'hover:bg-panel-2',
                  key === todayKey && !(edgeStart || edgeEnd) && 'ring-1 ring-accent/60 ring-inset',
                  future && 'cursor-not-allowed opacity-30',
                )}
              >
                {day.getDate()}
              </button>
            </div>
          )
        })}
      </div>
      <p className="mt-2 min-h-4 text-center text-xs text-muted">{start ? 'Выберите конечную дату' : ''}</p>
    </div>
  )
}

function Presets({ value, onPick, inline }: { value: Range; onPick: (range: Range) => void; inline?: boolean }) {
  return (
    <div className={clsx(inline ? 'no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1' : 'flex flex-col gap-0.5')}>
      {presets().map(({ label, range }) => {
        const active = range.from === value.from && range.to === value.to
        return (
          <button
            key={label}
            type="button"
            onClick={() => onPick(range)}
            className={clsx(
              'shrink-0 text-sm whitespace-nowrap transition-colors',
              inline ? 'min-h-9 rounded-full border px-3.5' : 'min-h-9 rounded-[8px] px-3 text-left',
              active
                ? inline
                  ? 'border-accent bg-accent-soft text-text'
                  : 'bg-accent-soft font-medium text-accent'
                : inline
                  ? 'border-border text-muted hover:text-text'
                  : 'text-muted hover:bg-panel-2 hover:text-text',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

export function DateRangePicker({ value, onChange, label = 'Период' }: { value: Range; onChange: (range: Range) => void; label?: string }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const desktop = useMediaQuery('(min-width: 640px)')

  const close = useCallback(() => setOpen(false), [])

  const choose = (range: Range) => {
    close()
    if (range.from !== value.from || range.to !== value.to) onChange(range)
  }

  const place = useCallback(() => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const left = Math.max(8, Math.min(r.left, window.innerWidth - PANEL_WIDTH - 8))
    const below = window.innerHeight - r.bottom
    const height = panel.current?.offsetHeight || 400
    if (below < height + GAP && r.top > below) setPos({ left, bottom: window.innerHeight - r.top + GAP })
    else setPos({ left, top: r.bottom + GAP })
  }, [])

  useLayoutEffect(() => {
    if (!open || !desktop) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, desktop, place])

  useEffect(() => {
    if (!open || !desktop) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!trigger.current?.contains(target) && !panel.current?.contains(target)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
      trigger.current?.focus({ preventScroll: true })
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, desktop, close])

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`${label}: ${formatRange(value)}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          'flex min-h-11 w-full items-center gap-2.5 rounded-[9px] border bg-panel pr-2.5 pl-3 text-left text-base text-text transition-colors sm:w-auto md:text-sm',
          open ? 'border-accent' : 'border-border hover:border-muted/50',
        )}
      >
        <CalendarDays className={clsx('h-4 w-4 shrink-0', open ? 'text-accent' : 'text-muted')} aria-hidden />
        <span className="min-w-0 flex-1 truncate">{formatRange(value)}</span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180 text-accent')} aria-hidden />
      </button>

      {desktop
        ? open
          ? createPortal(
              <div
                ref={panel}
                role="dialog"
                aria-label={label}
                className="select-pop fixed z-[70] flex gap-3 rounded-[14px] border border-border bg-panel p-3 shadow-2xl shadow-black/40"
                style={{ left: pos?.left ?? -9999, top: pos?.top, bottom: pos?.bottom, width: PANEL_WIDTH }}
              >
                <div className="w-[180px] shrink-0 border-r border-border pr-3">
                  <Presets value={value} onPick={choose} />
                </div>
                <Calendar value={value} onPick={choose} />
              </div>,
              document.body,
            )
          : null
        : (
          <BottomSheet open={open} title={label} onClose={close}>
            <Presets value={value} onPick={choose} inline />
            <div className="mt-4 flex justify-center">
              <Calendar value={value} onPick={choose} />
            </div>
            <Button variant="outline" className="mt-2 w-full" onClick={close}>
              Отмена
            </Button>
          </BottomSheet>
        )}
    </>
  )
}
