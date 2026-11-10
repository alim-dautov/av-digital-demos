import clsx from 'clsx'
import { KeyRound, Monitor, Moon, Sun } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { AppShell } from '../components/layout/AppShell'
import { Button, Card, Input } from '../components/ui'
import { ApiTokensPanel } from '../components/settings/ApiTokensPanel'
import { isRealOwner, useAuth } from '../lib/auth'
import { api } from '../lib/api'
import { promptInstall, useInstallState } from '../components/pwa/PwaPrompts'
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from '../lib/push'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { GrokBotSettings } from '../components/settings/GrokBotSettings'
import { StaffPanel } from '../components/settings/StaffPanel'
import { SidebarOrderCard } from '../components/settings/SidebarOrderCard'
import { RecurringTasksSettings } from '../components/settings/RecurringTasksSettings'
import { KpCompanySettings, KpiSettings } from '../components/settings/KpKpiSettings'

const THEMES = [
  ['dark', 'Тёмная', Moon],
  ['light', 'Светлая', Sun],
  ['system', 'Как в системе', Monitor],
] as const satisfies ReadonlyArray<readonly [ThemePref, string, unknown]>

export function SettingsPage() {
  const { user, logout, refresh, can } = useAuth()
  const theme = useThemePref()
  const install = useInstallState()
  const [vapid, setVapid] = useState<string | null>(null)

  useEffect(() => {
    void api<{ vapid_public_key: string }>('/me').then((d) => setVapid(d.vapid_public_key || ''))
  }, [])

  const profile = [
    ['Имя', user?.name],
    ['Логин', user?.username],
    ['Телефон', user?.phone],
    ['Email', user?.email],
    ['Роль', user?.role_name],
  ].filter((row): row is [string, string] => Boolean(row[1]))

  return (
    <AppShell title="Настройки" showFilters={false}>
      {user?.must_change_password ? (
        <div className="mb-4 flex items-start gap-3 rounded-[14px] border border-accent/40 bg-accent-soft p-4 text-sm" role="status">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p>
            Вы вошли с временным паролем. Придумайте свой в блоке <span className="font-medium">«Смена пароля»</span>.
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex min-w-0 flex-col p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-panel-2 text-sm font-semibold">{user?.initials}</span>
            <div className="min-w-0">
              <h2 className="truncate font-semibold">{user?.name}</h2>
              <p className="truncate text-sm text-muted">{user?.role_name}</p>
            </div>
          </div>
          <dl className="mt-4 grid gap-2 text-sm">
            {profile.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-t border-border pt-2">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 text-right break-words">
                  {label === 'Телефон' ? (
                    <a className="tabular hover:text-accent" href={`tel:${value.replace(/[^\d+]/g, '')}`}>
                      {value}
                    </a>
                  ) : (
                    value
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto pt-4">
            <Button variant="outline" className="w-full sm:w-auto" onClick={() => void logout()}>
              Выйти
            </Button>
          </div>
        </Card>
        <PasswordCard onChanged={refresh} />
        {install.standalone ? null : (
          <Card className="flex min-w-0 flex-col p-5">
            <h2 className="font-semibold">Установить приложение</h2>
            {install.ios ? (
              <p className="mt-2 text-sm text-muted">Поделиться → На экран Домой</p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Добавьте Demo CRM на экран устройства. На iPhone уведомления работают только у установленного приложения.
              </p>
            )}
            {install.prompt ? (
              <div className="mt-auto pt-4">
                <Button className="w-full sm:w-auto" onClick={() => void promptInstall()}>
                  Установить приложение
                </Button>
              </div>
            ) : null}
          </Card>
        )}
        <PushCard vapid={vapid} />
        <SidebarOrderCard />
        {user?.role === 'owner' ? <StaffPanel /> : null}
        {isRealOwner(user) ? <GrokBotSettings /> : null}
        {user?.role === 'owner' && !isRealOwner(user) ? <ApiTokensPanel kpOnly /> : null}
        {user?.role === 'owner' ? <KpCompanySettings /> : null}
        {user?.role === 'owner' ? <KpiSettings /> : null}
        {user?.role === 'owner' || can('tasks', 'update') ? <RecurringTasksSettings /> : null}
        <Card className="min-w-0 p-5 lg:col-span-2">
          <h2 className="font-semibold">Тема оформления</h2>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Тема оформления">
            {THEMES.map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={theme === key}
                onClick={() => setThemePref(key)}
                className={clsx(
                  'flex min-h-11 items-center gap-2.5 rounded-[9px] border px-3 text-sm transition-colors',
                  theme === key ? 'border-accent bg-accent-soft text-text' : 'border-border text-muted hover:text-text',
                )}
              >
                <Icon className={clsx('h-4 w-4 shrink-0', theme === key && 'text-accent')} aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

const PUSH_STATUS: Record<PushState, { label: string; tone: string }> = {
  on: { label: 'Включены в этом браузере', tone: 'text-success' },
  off: { label: 'Выключены', tone: 'text-muted' },
  denied: { label: 'Запрещены в настройках браузера. Разрешите уведомления для этого сайта и обновите страницу.', tone: 'text-danger' },
  unsupported: { label: 'Этот браузер не поддерживает уведомления. На iPhone установите приложение на экран «Домой».', tone: 'text-muted' },
  unconfigured: { label: 'Не настроены на сервере: нет VAPID-ключей.', tone: 'text-danger' },
}

function PushCard({ vapid }: { vapid: string | null }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)

  useEffect(() => {
    if (vapid === null) return
    void getPushState(vapid).then(setState)
  }, [vapid])

  async function run(action: () => Promise<string>) {
    setBusy(true)
    setMessage(null)
    try {
      setMessage({ text: await action(), error: false })
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Ошибка', error: true })
    } finally {
      if (vapid !== null) setState(await getPushState(vapid))
      setBusy(false)
    }
  }

  const status = state ? PUSH_STATUS[state] : null

  return (
    <Card className="flex min-w-0 flex-col p-5">
      <h2 className="font-semibold">Уведомления в браузере</h2>
      <p className="mt-2 text-sm text-muted">Сообщения о задачах и дедлайнах, даже когда вкладка закрыта.</p>
      {status ? <p className={clsx('mt-3 text-sm', status.tone)}>{status.label}</p> : null}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {state === 'off' ? (
          <Button className="w-full sm:w-auto" disabled={busy} onClick={() => void run(async () => (await enablePush(vapid || ''), 'Уведомления включены'))}>
            Включить уведомления
          </Button>
        ) : null}
        {state === 'on' ? (
          <>
            <Button
              className="w-full sm:w-auto"
              disabled={busy}
              onClick={() => void run(async () => (await sendTestPush(), 'Тестовое уведомление отправлено — оно появится в течение нескольких секунд'))}
            >
              Отправить тестовое
            </Button>
            <Button variant="outline" className="w-full sm:w-auto" disabled={busy} onClick={() => void run(async () => (await disablePush(), 'Уведомления выключены'))}>
              Выключить
            </Button>
          </>
        ) : null}
      </div>
      {message ? (
        <p className={clsx('mt-2 text-sm', message.error ? 'text-danger' : 'text-muted')} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      ) : null}
    </Card>
  )
}

const MIN_PASSWORD_LENGTH = 8

function PasswordCard({ onChanged }: { onChanged: () => Promise<void> }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    if (next.length < MIN_PASSWORD_LENGTH) return setError(`Новый пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов`)
    if (next !== repeat) return setError('Пароли не совпадают')
    setBusy(true)
    setError(null)
    try {
      await api('/me/password', { method: 'POST', body: JSON.stringify({ current_password: current, new_password: next }) })
      setCurrent('')
      setNext('')
      setRepeat('')
      setDone(true)
      await onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить пароль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex min-w-0 flex-col p-5">
      <h2 className="font-semibold">Смена пароля</h2>
      <p className="mt-1 text-sm text-muted">Остальные устройства выйдут из аккаунта после смены.</p>
      <form className="mt-4 flex flex-1 flex-col gap-3" onSubmit={onSubmit}>
        <label className="text-sm text-muted">
          Текущий пароль
          <Input className="mt-1" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="text-sm text-muted">
          Новый пароль
          <Input
            className="mt-1"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
        </label>
        <label className="text-sm text-muted">
          Повторите новый пароль
          <Input className="mt-1" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />
        </label>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {done ? (
          <p className="text-sm text-success" role="status">
            Пароль изменён
          </p>
        ) : null}
        <div className="mt-auto pt-1">
          <Button type="submit" className="w-full sm:w-auto" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сменить пароль'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
