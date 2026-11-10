import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from './api'
import { useAuth } from './auth'

export const TASK_SEEN_EVENT = 'demo:task-seen'

const POLL_MS = 30_000

const UnseenTaskCountContext = createContext(0)
const UnreadMentionCountContext = createContext(0)

/** Red badge on the installed PWA icon: unread @mentions. Zero clears it. */
export function syncAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  if (!nav.setAppBadge) return
  void (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge?.())?.catch(() => undefined)
}

export function notifyTaskSeen(taskId: number) {
  window.dispatchEvent(new CustomEvent(TASK_SEEN_EVENT, { detail: { id: taskId } }))
}

export function UnseenTasksProvider({ children }: { children: ReactNode }) {
  const { user, can } = useAuth()
  const { pathname } = useLocation()
  const [count, setCount] = useState(0)
  const [mentions, setMentions] = useState(0)
  const allowed = Boolean(user) && can('tasks')

  const load = useCallback(async () => {
    if (!allowed) {
      setCount(0)
      setMentions(0)
      return
    }
    try {
      const data = await api<{ count: number; mentions?: number }>('/tasks/unseen-count')
      setCount(Math.max(0, data.count))
      setMentions(Math.max(0, data.mentions ?? 0))
    } catch {
      /* keep the last count while offline */
    }
  }, [allowed])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load()
    }, POLL_MS)
    const onSeen = () => void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener(TASK_SEEN_EVENT, onSeen)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(TASK_SEEN_EVENT, onSeen)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load, pathname])

  useEffect(() => {
    syncAppBadge(user ? mentions : 0)
  }, [mentions, user])

  return createElement(
    UnseenTaskCountContext.Provider,
    { value: count },
    createElement(UnreadMentionCountContext.Provider, { value: mentions }, children),
  )
}

export function useUnseenTaskCount(): number {
  return useContext(UnseenTaskCountContext)
}

export function useUnreadMentionCount(): number {
  return useContext(UnreadMentionCountContext)
}

export function taskCountLabel(count: number): string {
  return count > 99 ? '99+' : String(count)
}
