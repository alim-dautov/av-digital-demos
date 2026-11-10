import clsx from 'clsx'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { PRIORITY_LABEL, STATUS_LABEL, loadPrefs, savePrefs, useTeamUsers, type UserPrefs } from '../../lib/tasks'
import { MQ_MD, useMediaQuery } from '../../lib/useMediaQuery'
import { BottomSheet, Button, Select } from '../ui'

export const FILTER_KEYS = ['assignee_id', 'due', 'priority', 'status', 'q'] as const

const DUE_LABEL: Record<string, string> = {
  today: 'Срок сегодня',
  overdue: 'Просроченные',
  week: 'На этой неделе',
  none: 'Без срока',
}

export function TaskFilters() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const seeAll = user?.role === 'owner' || user?.see_all_tasks === true
  const users = useTeamUsers()
  const inline = useMediaQuery(MQ_MD)
  const [q, setQ] = useState(params.get('q') || '')
  const [prefs, setPrefs] = useState<UserPrefs | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    loadPrefs()
      .then(setPrefs)
      .catch(() => setPrefs(null))
  }, [])

  const urlQ = params.get('q') || ''
  const pushedQ = useRef(urlQ)

  useEffect(() => {
    if (urlQ !== pushedQ.current) {
      pushedQ.current = urlQ
      setQ(urlQ)
    }
  }, [urlQ])

  useEffect(() => {
    const value = q.trim()
    if (value === pushedQ.current) return
    const timer = window.setTimeout(() => {
      pushedQ.current = value
      set('q', value)
    }, 250)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function set(key: string, value: string) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  const filterQuery = () => {
    const out = new URLSearchParams()
    for (const key of [...FILTER_KEYS, 'scope']) {
      const v = params.get(key)
      if (v) out.set(key, v)
    }
    return out.toString()
  }

  const active = FILTER_KEYS.some((k) => params.get(k))
  const activeCount = FILTER_KEYS.filter((k) => k !== 'q' && params.get(k)).length
  const width = inline ? 'w-auto' : 'w-full'

  async function persist(saved: UserPrefs['saved_filters']) {
    setPrefs(await savePrefs({ saved_filters: saved }))
  }

  const reset = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        FILTER_KEYS.forEach((k) => next.delete(k))
        return next
      },
      { replace: true },
    )

  const search = (
    <form
      className="relative min-w-0 flex-1 sm:min-w-[200px]"
      onSubmit={(e) => {
        e.preventDefault()
        pushedQ.current = q.trim()
        set('q', q.trim())
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        enterKeyHint="search"
        className="min-h-11 w-full rounded-[9px] border border-border bg-panel pr-3 pl-9 text-base md:text-sm"
        placeholder="Поиск по названию, номеру или сотруднику"
        aria-label="Поиск задач"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  )

  const selects = (
    <>
      {seeAll ? (
        <Select aria-label="Сотрудник" className={width} value={params.get('assignee_id') || ''} onChange={(e) => set('assignee_id', e.target.value)}>
          <option value="">Все</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      ) : null}
      <Select aria-label="Срок" className={width} value={params.get('due') || ''} onChange={(e) => set('due', e.target.value)}>
        <option value="">Любой срок</option>
        {Object.entries(DUE_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select aria-label="Приоритет" className={width} value={params.get('priority') || ''} onChange={(e) => set('priority', e.target.value)}>
        <option value="">Любой приоритет</option>
        {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      <Select aria-label="Статус" className={width} value={params.get('status') || ''} onChange={(e) => set('status', e.target.value)}>
        <option value="">Любой статус</option>
        <option value="new,in_progress,on_review">Открытые</option>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </Select>
      {prefs ? (
        <Select
          aria-label="Сохранённые фильтры"
          className={width}
          value=""
          onChange={async (e) => {
            const value = e.target.value
            if (value === '__save') {
              const name = window.prompt('Название фильтра')?.trim()
              if (name) await persist([...prefs.saved_filters.filter((f) => f.name !== name), { name, query: filterQuery() }])
              return
            }
            if (value.startsWith('__del:')) {
              const name = value.slice(6)
              await persist(prefs.saved_filters.filter((f) => f.name !== name))
              return
            }
            const saved = prefs.saved_filters.find((f) => f.name === value)
            if (saved) {
              const next = new URLSearchParams(saved.query)
              const view = params.get('view')
              if (view) next.set('view', view)
              setParams(next, { replace: true })
            }
          }}
        >
          <option value="">Мои фильтры</option>
          {prefs.saved_filters.map((f) => (
            <option key={f.name} value={f.name}>
              {f.name}
            </option>
          ))}
          {active ? <option value="__save">+ Сохранить текущий</option> : null}
          {prefs.saved_filters.length > 0 ? (
            <optgroup label="Удалить">
              {prefs.saved_filters.map((f) => (
                <option key={`del-${f.name}`} value={`__del:${f.name}`}>
                  × {f.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </Select>
      ) : null}
    </>
  )

  if (!inline) {
    return (
      <div className="flex items-center gap-2">
        {search}
        <Button
          variant="outline"
          className={clsx('shrink-0 px-3', activeCount > 0 && 'border-accent text-accent')}
          onClick={() => setSheetOpen(true)}
          aria-label={activeCount > 0 ? `Фильтры, выбрано ${activeCount}` : 'Фильтры'}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {activeCount > 0 ? <span className="tabular">{activeCount}</span> : null}
        </Button>
        <BottomSheet open={sheetOpen} title="Фильтры" onClose={() => setSheetOpen(false)}>
          <div className="grid gap-3">
            {selects}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={reset} disabled={!active}>
                Сбросить
              </Button>
              <Button onClick={() => setSheetOpen(false)}>Готово</Button>
            </div>
          </div>
        </BottomSheet>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {search}
      {selects}
      {active ? (
        <Button variant="ghost" className="text-muted" onClick={reset}>
          <X className="h-4 w-4" aria-hidden /> Сбросить
        </Button>
      ) : null}
    </div>
  )
}
