import { useEffect, useState, useSyncExternalStore } from 'react'
import { X } from 'lucide-react'
import { Button } from '../ui'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type InstallSnapshot = {
  prompt: InstallPromptEvent | null
  standalone: boolean
  ios: boolean
}

const listeners = new Set<() => void>()
let promptEvent: InstallPromptEvent | null = null
let snapshot: InstallSnapshot = { prompt: null, standalone: false, ios: false }

function emit() {
  listeners.forEach((listener) => listener())
}

function standaloneNow() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  )
}

function iosNow() {
  const iPadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || iPadOs
}

function publish() {
  snapshot = { prompt: promptEvent, standalone: standaloneNow(), ios: iosNow() }
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

function getServerSnapshot(): InstallSnapshot {
  return { prompt: null, standalone: false, ios: false }
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    promptEvent = event as InstallPromptEvent
    publish()
  })
  window.addEventListener('appinstalled', () => {
    promptEvent = null
    publish()
  })
  snapshot = { prompt: null, standalone: standaloneNow(), ios: iosNow() }
}

export function useInstallState() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

export async function promptInstall() {
  if (!promptEvent || typeof promptEvent.prompt !== 'function') return
  await promptEvent.prompt()
  try {
    await promptEvent.userChoice
  } catch {
    /* the browser closed the dialog */
  }
  promptEvent = null
  publish()
}

const BANNER_KEY = 'demo-install-banner'

export function PwaInstallBanner() {
  const { prompt, standalone, ios } = useInstallState()
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(BANNER_KEY) === '1'
    } catch {
      return false
    }
  })

  if (standalone || hidden) return null

  function dismiss() {
    sessionStorage.setItem(BANNER_KEY, '1')
    setHidden(true)
  }

  if (prompt) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(0.75rem+var(--safe-top))]">
        <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-[12px] border border-border bg-panel px-3 py-2 shadow-lg">
          <Button type="button" className="min-h-11" onClick={() => void promptInstall()}>
            Установить приложение
          </Button>
          <button type="button" className="flex h-11 w-11 items-center justify-center text-muted" aria-label="Скрыть" onClick={dismiss}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
    )
  }

  if (!ios) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[calc(0.75rem+var(--safe-top))]">
      <div className="pointer-events-auto flex max-w-md items-center gap-2 rounded-[12px] border border-border bg-panel px-3 py-2 text-sm shadow-lg" role="status">
        <p>Поделиться → На экран Домой</p>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-muted" aria-label="Скрыть" onClick={dismiss}>
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function PwaUpdateToast() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [update, setUpdate] = useState<null | ((reload?: boolean) => Promise<void>)>(null)

  useEffect(() => {
    let cancelled = false
    void import('virtual:pwa-register')
      .then((mod) => {
        if (cancelled) return
        const registerSW = mod.registerSW as (opts: {
          immediate?: boolean
          onNeedRefresh?: () => void
          onRegistered?: (registration: ServiceWorkerRegistration | undefined) => void
        }) => (reload?: boolean) => Promise<void>
        let apply: ((reload?: boolean) => Promise<void>) | null = null
        // A new deploy is applied on its own so the PWA never keeps running an old bundle,
        // unless the person is typing: then the toast waits for them, or for the app to go to background.
        const applyWhenIdle = () => {
          const el = document.activeElement
          const typing = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.value !== '')
          if (apply && (!typing || document.visibilityState === 'hidden')) void apply(true)
        }
        const updateServiceWorker = registerSW({
          immediate: true,
          onNeedRefresh() {
            setNeedRefresh(true)
            applyWhenIdle()
            document.addEventListener('visibilitychange', applyWhenIdle)
          },
          onRegistered(registration) {
            if (!registration) return
            window.setInterval(() => void registration.update(), 60 * 60 * 1000)
            // Reopening a PWA that stayed open for days checks for a new deploy right away.
            document.addEventListener('visibilitychange', () => {
              if (document.visibilityState === 'visible') void registration.update().catch(() => {})
            })
          },
        })
        apply = updateServiceWorker
        setUpdate(() => updateServiceWorker)
      })
      .catch(() => {
        /* virtual:pwa-register is absent when the PWA plugin is disabled */
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!needRefresh || !update) return null

  return (
    <div
      className="fixed bottom-[calc(5rem+var(--safe-bottom))] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-border bg-panel px-4 py-2 text-sm shadow-lg md:bottom-6"
      role="status"
    >
      <span>Доступна новая версия —</span>
      <button type="button" className="min-h-11 font-medium text-accent" onClick={() => void update(true)}>
        Обновить
      </button>
    </div>
  )
}
