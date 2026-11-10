import clsx from 'clsx'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { formatDateTime } from '../../lib/tasks'
import { BottomSheet, Button } from '../ui'

type Notification = {
  id: number
  kind: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 30_000

export function NotificationBell() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [justRead, setJustRead] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: Notification[]; unread: number }>('/notifications')
      setItems(data.items)
      setUnread(data.unread)
    } catch {
      /* the badge simply stays stale while offline */
    }
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setClosing(true)
  }, [])

  useEffect(() => {
    void load()
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), POLL_MS)
    return () => window.clearInterval(id)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.body.classList.contains('modal-open') && close()
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  async function markRead(ids: number[]) {
    await api('/notifications/read', { method: 'POST', body: JSON.stringify({ ids }) }).catch(() => undefined)
    await load()
  }

  async function readAll() {
    setConfirming(false)
    const now = new Date().toISOString()
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })))
    setUnread(0)
    setJustRead(true)
    window.setTimeout(() => setJustRead(false), 2000)
    await markRead([])
  }

  let unreadOrder = 0

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        className={clsx(
          'relative flex h-11 w-11 items-center justify-center rounded-[9px] transition-colors hover:bg-panel-2 hover:text-text',
          open ? 'bg-panel-2 text-text' : 'text-muted',
        )}
        aria-label={unread > 0 ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
        aria-expanded={open}
        onClick={() => {
          if (open) return close()
          setClosing(false)
          setOpen(true)
          void load()
        }}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 || justRead ? (
          <span
            className={clsx(
              'tabular absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white transition-all duration-300',
              unread === 0 && 'scale-0 opacity-0',
            )}
          >
            {unread > 99 ? '99+' : unread || ''}
          </span>
        ) : null}
      </button>
      {open || closing ? (
        <div
          className={clsx(
            'fixed inset-x-2 top-[calc(3.75rem+var(--safe-top))] z-50 flex max-h-[calc(100dvh-10rem)] origin-top flex-col overflow-hidden rounded-[14px] border border-border bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:max-h-[70vh] sm:w-96 sm:origin-top-right',
            open ? 'popover-in' : 'popover-out pointer-events-none',
          )}
          role="dialog"
          aria-label="Уведомления"
          onAnimationEnd={(e) => e.target === e.currentTarget && !open && setClosing(false)}
        >
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 py-1.5">
            <span className="text-sm font-semibold">Уведомления</span>
            {unread > 0 ? (
              <button
                type="button"
                className="-mr-2 inline-flex min-h-9 items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium text-accent transition-colors hover:bg-accent-soft"
                onClick={() => setConfirming(true)}
              >
                <CheckCheck className="h-4 w-4" aria-hidden />
                Прочитать все
              </button>
            ) : justRead ? (
              <span className="read-done inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-success" role="status">
                <Check className="h-4 w-4" aria-hidden />
                Всё прочитано
              </span>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted">Уведомлений нет</li> : null}
            {items.map((n) => {
              const delay = justRead ? `${Math.min(unreadOrder++, 10) * 50}ms` : undefined
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    style={{ transitionDelay: delay }}
                    className={clsx(
                      'flex w-full gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-500 hover:bg-panel-2',
                      !n.read_at && 'bg-accent-soft/40',
                    )}
                    onClick={() => {
                      if (!n.read_at) void markRead([n.id])
                      close()
                      if (n.url) navigate(n.url)
                    }}
                  >
                    <span
                      style={{ transitionDelay: delay }}
                      className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent transition-all duration-300', n.read_at && 'scale-0 opacity-0')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium break-words">{n.title}</span>
                      {n.body ? <span className="line-clamp-2 block text-xs text-muted">{n.body}</span> : null}
                      <span className="mt-1 block text-[11px] text-muted">{formatDateTime(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      <BottomSheet open={confirming} title="Прочитать все уведомления?" onClose={() => setConfirming(false)}>
        <p className="text-sm text-muted">
          {unread === 1
            ? 'Одно непрочитанное уведомление будет отмечено как прочитанное.'
            : `Непрочитанных: ${unread}. Все они будут отмечены как прочитанные.`}{' '}
          Сами уведомления останутся в списке.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setConfirming(false)}>
            Отмена
          </Button>
          <Button onClick={() => void readAll()} autoFocus>
            <CheckCheck className="h-4 w-4" aria-hidden />
            Прочитать
          </Button>
        </div>
      </BottomSheet>
    </div>
  )
}
