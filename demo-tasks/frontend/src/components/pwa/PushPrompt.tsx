import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { enablePush, getPushState, type PushState } from '../../lib/push'
import { useInstallState } from './PwaPrompts'

const DISMISS_KEY = 'demo-push-prompt-dismissed'
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000

function dismissedRecently(): boolean {
  const at = Number(localStorage.getItem(DISMISS_KEY) || 0)
  return at > 0 && Date.now() - at < DISMISS_MS
}

/**
 * Asks a signed-in user to turn on push so @mentions reach them.
 * On iPhone push works only from the app added to the home screen, so a Safari tab gets that hint instead.
 */
export function PushPrompt() {
  const { user } = useAuth()
  const { standalone, ios } = useInstallState()
  const [vapid, setVapid] = useState<string | null>(null)
  const [state, setState] = useState<PushState | null>(null)
  const [hidden, setHidden] = useState(dismissedRecently)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user || hidden) return
    void api<{ vapid_public_key: string }>('/me')
      .then((d) => setVapid(d.vapid_public_key || ''))
      .catch(() => setVapid(''))
  }, [user, hidden])

  useEffect(() => {
    if (vapid === null) return
    void getPushState(vapid).then(setState)
  }, [vapid])

  if (!user || hidden || state === null) return null
  const iosHint = ios && !standalone && state === 'unsupported'
  if (state !== 'off' && !iosHint) return null

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setHidden(true)
  }

  return (
    <div className="flex items-center gap-3 border-b border-border bg-accent-soft px-4 py-2 text-xs text-accent md:px-6" role="status">
      <BellRing className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {iosHint
          ? 'Чтобы получать уведомления об упоминаниях на iPhone, добавьте приложение на экран «Домой» (Поделиться → «На экран Домой»), откройте его оттуда и включите уведомления.'
          : 'Включите уведомления, чтобы сразу узнавать, когда вас отметили в задаче.'}
        {error ? <span className="ml-2 text-danger">{error}</span> : null}
      </span>
      {!iosHint ? (
        <button
          type="button"
          className="min-h-8 shrink-0 rounded-[8px] bg-accent px-3 font-medium text-white disabled:opacity-60"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              await enablePush(vapid || '')
              setState('on')
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Не удалось включить')
              if (typeof Notification !== 'undefined' && Notification.permission === 'denied') setState('denied')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Включаем…' : 'Включить'}
        </button>
      ) : null}
      <button type="button" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-panel" aria-label="Скрыть" onClick={dismiss}>
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
