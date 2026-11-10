import { useEffect, useState } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, Spinner } from '../components/ui'
import { api } from '../lib/api'
import { ExternalLink } from 'lucide-react'
import { isIosStandalone } from '../lib/pwaMode'


type Channel = { transport: string; state: string; name: string }

const STATE_LABEL: Record<string, string> = {
  active: 'подключён',
  qr: 'нужно отсканировать QR-код в Wazzup',
  init: 'запускается',
  disabled: 'выключен',
  phoneUnavailable: 'телефон недоступен',
  unauthorized: 'не авторизован',
  notEnoughMoney: 'не оплачен',
  waitForPassword: 'ждёт пароль',
}

export function WhatsappPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [ios] = useState(() => isIosStandalone())
  const [embed, setEmbed] = useState(() => !isIosStandalone())

  useEffect(() => {
    let alive = true
    setError(null)
    setUrl(null)
    void api<{ items: Channel[] }>('/whatsapp/channels')
      .then((r) => alive && setChannels(r.items))
      .catch(() => undefined)
    void api<{ url: string }>('/whatsapp/iframe', { method: 'POST', body: JSON.stringify({}) })
      .then((r) => alive && setUrl(r.url))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Не удалось открыть чаты'))
    return () => {
      alive = false
    }
  }, [attempt])

  const wa = channels.filter((c) => c.transport === 'whatsapp')
  // A plain link opened by the tap itself: iOS standalone hands it to an in-app Safari sheet,
  // where Wazzup is first-party and its cookies work. No async window.open (iOS would block it).
  const openLink = url ? (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
    >
      <ExternalLink className="h-4 w-4" aria-hidden />
      Открыть в Wazzup
    </a>
  ) : null

  return (
    <AppShell title="WhatsApp" showFilters={false}>
      <div className="page-enter grid gap-3">
        {wa.map((c) => (
          <p
            key={c.name}
            className={c.state === 'active' ? 'text-sm text-muted' : 'rounded-[10px] bg-warning/10 px-3 py-2 text-sm text-warning'}
          >
            WhatsApp {c.name}: {STATE_LABEL[c.state] ?? c.state}
          </p>
        ))}
        {error ? (
          <Card className="grid justify-items-start gap-3 p-4 text-sm">
            <p className="text-danger">{error}</p>
            <Button onClick={() => setAttempt((n) => n + 1)}>Повторить</Button>
          </Card>
        ) : url && !embed ? (
          <Card className="grid justify-items-start gap-3 p-4 text-sm">
            <p>
              В приложении на iPhone окно диалога Wazzup внутри CRM не работает: iOS блокирует его данные входа.
              Откройте чаты отдельно — переписка идёт как обычно, потом вернитесь в CRM.
            </p>
            {openLink}
            <button type="button" className="text-xs text-muted underline" onClick={() => setEmbed(true)}>
              Всё равно показать встроенное окно
            </button>
          </Card>
        ) : url ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted">
                {ios ? 'Если диалог не открывается — откройте Wazzup отдельно.' : 'Не открывается диалог? Откройте Wazzup в новой вкладке.'}
              </p>
              {openLink}
            </div>
            <iframe
              title="Wazzup"
              src={url}
              allow="microphone *; clipboard-read *; clipboard-write *; storage-access *"
              className="h-[calc(100dvh-17rem)] min-h-[420px] w-full rounded-[12px] border border-border bg-white md:h-[calc(100dvh-13rem)] md:min-h-[480px]"
            />
          </>
        ) : (
          <Spinner label="Открываем чаты…" />
        )}
      </div>
    </AppShell>
  )
}
