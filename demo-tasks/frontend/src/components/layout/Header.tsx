import clsx from 'clsx'
import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'
import { useAuth } from '../../lib/auth'
import { Button } from '../ui'
import { NotificationBell } from './NotificationBell'

type Props = {
  title: string
  subtitle?: string
  showFilters?: boolean
  toolbar?: ReactNode
  onCreateTask?: () => void
}

export function Header({ title, subtitle, showFilters = true, toolbar, onCreateTask }: Props) {
  const { user } = useAuth()
  const showCreate = showFilters && Boolean(onCreateTask)

  return (
    <header className="flex flex-col gap-3 border-b border-border px-4 py-3 md:gap-4 md:px-6 md:py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="title-reveal truncate text-xl font-semibold tracking-tight text-text sm:text-2xl md:text-[28px]">{title}</h1>
          {subtitle ? <p className="mt-0.5 hidden truncate text-sm text-muted sm:block">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          <NotificationBell />
          <div className="flex min-h-11 items-center gap-2">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full bg-panel-2 text-xs font-semibold"
              aria-hidden
            >
              {user?.initials || '??'}
            </span>
            <div className="hidden text-sm lg:block">
              <div className="font-medium text-text">{user?.name}</div>
              <div className="text-muted">{user?.role_name}</div>
            </div>
          </div>
        </div>
      </div>
      {showFilters && (toolbar || onCreateTask) ? (
        <div className={clsx('header-toolbar flex-wrap items-center gap-2', toolbar ? 'flex' : 'hidden md:flex')}>
          {toolbar}
          <div className="hidden flex-1 md:block" />
          {showCreate ? (
            <div className="hidden md:block">
              <Button onClick={onCreateTask} aria-label="Создать задачу">
                <Plus className="h-4 w-4" aria-hidden />
                Создать задачу
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {showCreate ? (
        <button
          type="button"
          onClick={onCreateTask}
          aria-label="Создать задачу"
          className="fixed right-4 bottom-[calc(5rem+var(--safe-bottom))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-black/40 transition active:scale-95 md:hidden"
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
      ) : null}
    </header>
  )
}
