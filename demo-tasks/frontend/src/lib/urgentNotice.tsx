import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './auth'
import { enablePush, pushSupported } from './push'

type NoticeItem = {
  id: number
  kind: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

const STORAGE_KEY = 'demo-urgent-shown-ids'
const POLL_MS = 12_000
const RECENT_MS = 15 * 60_000
const MAX_POPUPS = 3

let vapidPromise: Promise<string> | null = null

function vapidKey(): Promise<string> {
  vapidPromise ??= api<{ vapid_public_key?: string }>('/me')
    .then((data) => data.vapid_public_key || '')
    .catch(() => '')
  return vapidPromise
}

/** User gesture: ask for browser notifications and subscribe to Web Push when the server has a VAPID key. */
export async function prepareUrgentAlerts(): Promise<void> {
  const key = await vapidKey()
  if (key && pushSupported()) {
    try {
      await enablePush(key)
      return
    } catch {
      /* Permission can still be granted for in-page Notification even if push subscribe fails. */
    }
  }
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => undefined)
  }
}

function readShown(): { initialized: boolean; ids: Set<number> } {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === null) return { initialized: false, ids: new Set() }
  try {
    const parsed = JSON.parse(raw) as unknown
    const ids = Array.isArray(parsed) ? parsed.map(Number).filter((id) => id > 0) : []
    return { initialized: true, ids: new Set(ids) }
  } catch {
    return { initialized: true, ids: new Set() }
  }
}

function writeShown(ids: Set<number>) {
  const list = [...ids].slice(-200)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

function createdMs(value: string): number {
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}+05:00`
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

function playUrgentSound() {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  const oscillator = ctx.createOscillator()
  const gain = ctx.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(880, ctx.currentTime)
  oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.14)
  gain.gain.setValueAtTime(0.0001, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42)
  oscillator.connect(gain)
  gain.connect(ctx.destination)
  oscillator.start()
  oscillator.stop(ctx.currentTime + 0.45)
  oscillator.onended = () => void ctx.close()
}

function showBrowserNotification(item: NoticeItem) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  const title = item.title || `Срочная задача: ${item.body || ''}`.trim()
  try {
    const note = new Notification(title, {
      body: item.body || '',
      lang: 'ru',
      tag: `urgent-${item.id}`,
      icon: '/pwa-icons/icon-192-v2.png',
    })
    note.onclick = () => {
      window.focus()
      if (item.url) window.location.assign(item.url)
      note.close()
    }
  } catch {
    /* Some browsers only expose Notification inside a service worker. The in-page banner still shows. */
  }
}

export function UrgentNoticeProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth()
  const navigate = useNavigate()
  const [banner, setBanner] = useState<NoticeItem | null>(null)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'Notification' in window ? Notification.permission : 'unsupported',
  )
  const allowed = Boolean(user) && can('tasks')

  const consider = useCallback((items: NoticeItem[]) => {
    const urgent = items.filter((item) => item.kind === 'task_urgent')
    if (urgent.length === 0 && localStorage.getItem(STORAGE_KEY) !== null) return
    const stored = readShown()
    const fresh = urgent.filter((item) => !item.read_at && !stored.ids.has(item.id))
    let announce = fresh
    if (!stored.initialized) {
      const cutoff = Date.now() - RECENT_MS
      const recent = fresh.filter((item) => createdMs(item.created_at) >= cutoff)
      for (const item of urgent) {
        if (!recent.includes(item)) stored.ids.add(item.id)
      }
      announce = recent
    }
    announce = announce.slice(0, MAX_POPUPS)
    if (announce.length > 0) {
      playUrgentSound()
      for (const item of announce) showBrowserNotification(item)
      setBanner(announce[announce.length - 1])
    }
    for (const item of announce) stored.ids.add(item.id)
    for (const item of urgent) {
      if (item.read_at) stored.ids.add(item.id)
    }
    writeShown(stored.ids)
  }, [])

  const load = useCallback(async () => {
    if (!allowed) return
    try {
      const data = await api<{ items: NoticeItem[] }>('/notifications')
      consider(data.items)
    } catch {
      /* keep waiting for the next poll */
    }
  }, [allowed, consider])

  useEffect(() => {
    if (!allowed) {
      setBanner(null)
      return
    }
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [allowed, load])

  return (
    <>
      {children}
      {banner ? (
        <div
          className="fixed top-[calc(4.25rem+var(--safe-top))] left-1/2 z-[80] w-[min(440px,calc(100%-1.5rem))] -translate-x-1/2 rounded-[14px] border-2 border-[#7f1d1d] bg-[#dc2626] px-4 py-3 text-white shadow-2xl"
          role="status"
          data-urgent-notice
        >
          <p className="text-sm font-semibold">{banner.title}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {banner.url ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-[9px] bg-white px-3 text-sm font-semibold text-[#991b1b]"
                onClick={() => {
                  const url = banner.url || '/tasks'
                  setBanner(null)
                  navigate(url)
                }}
              >
                Открыть
              </button>
            ) : null}
            {permission !== 'granted' && permission !== 'unsupported' ? (
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-[9px] border border-white/70 px-3 text-sm font-medium"
                onClick={() => {
                  void prepareUrgentAlerts().then(() => {
                    const next = 'Notification' in window ? Notification.permission : 'unsupported'
                    setPermission(next)
                    if (next === 'granted') showBrowserNotification(banner)
                  })
                }}
              >
                Разрешить уведомления
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 items-center rounded-[9px] px-3 text-sm font-medium text-white/90"
              onClick={() => setBanner(null)}
            >
              Скрыть
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
