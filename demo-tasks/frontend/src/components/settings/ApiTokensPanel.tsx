import { Check, Copy } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { Button, Card, Input, Select, Spinner } from '../ui'
import { api } from '../../lib/api'
import { formatDateTime, fromInputDateTime } from '../../lib/tasks'

type Person = { id: number; name: string }

type TokenRow = {
  id: number
  name: string
  prefix: string
  user_id: number
  user_name: string
  scope: 'full' | 'kp'
  created_at: string
  last_used_at: string | null
  expires_at: string | null
  revoked_at: string | null
}

type Issued = TokenRow & { token: string }

/** kpOnly: superadmin block «API для КП» — only KP-only tokens (the server enforces the same). */
export function ApiTokensPanel({ kpOnly = false }: { kpOnly?: boolean } = {}) {
  const tokenFieldId = useId()
  const [people, setPeople] = useState<Person[]>([])
  const [items, setItems] = useState<TokenRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [userId, setUserId] = useState('')
  const [expires, setExpires] = useState('')
  const [scope, setScope] = useState<'full' | 'kp'>(kpOnly ? 'kp' : 'full')
  const [busy, setBusy] = useState(false)
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [deleteId, setDeleteId] = useState<number | null>(null)

  async function load() {
    const [users, tokens] = await Promise.all([
      api<{ items: Person[] }>('/meta/users'),
      api<{ items: TokenRow[] }>('/api-tokens'),
    ])
    setPeople(users.items.map((person) => ({ id: person.id, name: person.name })))
    setItems(tokens.items)
  }

  useEffect(() => {
    let cancelled = false
    void load().catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить токены')
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!userId) {
      setError('Выберите сотрудника')
      return
    }
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const created = await api<Issued>('/api-tokens', {
        method: 'POST',
        body: JSON.stringify({
          name,
          user_id: Number(userId),
          expires_at: fromInputDateTime(expires),
          scope,
        }),
      })
      setName('')
      setExpires('')
      setIssued(created)
      setConfirmId(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать токен')
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: number) {
    setBusy(true)
    setError(null)
    try {
      const updated = await api<TokenRow>(`/api-tokens/${id}/revoke`, { method: 'POST', body: '{}' })
      setItems((prev) => (prev ? prev.map((item) => (item.id === updated.id ? updated : item)) : prev))
      setConfirmId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отозвать токен')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    setBusy(true)
    setError(null)
    try {
      await api(`/api-tokens/${id}`, { method: 'DELETE' })
      setItems((prev) => (prev ? prev.filter((item) => item.id !== id) : prev))
      setDeleteId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить токен')
    } finally {
      setBusy(false)
    }
  }

  async function copyToken() {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.token)
      setCopied(true)
    } catch {
      const field = document.getElementById(tokenFieldId) as HTMLInputElement | null
      field?.focus()
      field?.select()
      setError('Не удалось скопировать автоматически. Выделите токен и скопируйте его вручную.')
    }
  }

  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <h2 className="font-semibold">{kpOnly ? 'API для КП' : 'API-ключи'}</h2>
      {kpOnly ? (
        <p className="mt-1 text-sm text-muted">
          Ключи «Только КП»: работают только с /api/kp, MCP и остальной API отвечают отказом. Заголовок Authorization: Bearer и этот секрет. Полный секрет показывается один раз, в базе хранится только хеш.
        </p>
      ) : (
      <p className="mt-1 text-sm text-muted">
        Для MCP и внешнего помощника. Заголовок Authorization: Bearer и этот секрет. Токен работает от имени выбранного сотрудника: те же разделы и те же задачи. Полный секрет показывается один раз, в базе хранится только хеш. Доступ «Всё» — как раньше (MCP, Grok и весь API); доступ «Только КП» — ключ работает только с /api/kp, остальное и MCP отвечают отказом.
      </p>
      )}

      <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_1fr_auto]" onSubmit={create}>
        <label className="text-sm text-muted">
          Название
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={128} required />
        </label>
        <label className="text-sm text-muted">
          Сотрудник
          <Select className="mt-1 w-full" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Сотрудник">
            <option value="">Выберите сотрудника</option>
            {people.map((person) => (
              <option key={person.id} value={String(person.id)}>
                {person.name}
              </option>
            ))}
          </Select>
        </label>
        {kpOnly ? (
          <p className="self-end pb-3 text-sm text-muted">Доступ: только КП</p>
        ) : (
        <label className="text-sm text-muted">
          Доступ
          <Select className="mt-1 w-full" value={scope} onChange={(e) => setScope(e.target.value as 'full' | 'kp')} aria-label="Доступ">
            <option value="full">Всё</option>
            <option value="kp">Только КП</option>
          </Select>
        </label>
        )}
        <label className="text-sm text-muted">
          Действует до
          <Input className="mt-1" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={busy || items === null}>
            Создать токен
          </Button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted">Пустой срок — токен действует, пока его не отзовут.</p>

      {issued ? (
        <div className="mt-4 rounded-[12px] border border-accent/50 bg-accent-soft p-4" role="status">
          <p className="text-sm font-medium">Скопируйте токен «{issued.name}» сейчас. Повторно он не показывается.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input id={tokenFieldId} className="font-mono" readOnly value={issued.token} aria-label="Новый токен" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" variant="outline" className="shrink-0" onClick={() => void copyToken()}>
              {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
              {copied ? 'Скопировано' : 'Скопировать'}
            </Button>
          </div>
          <div className="mt-3">
            <Button type="button" variant="ghost" onClick={() => setIssued(null)}>
              Скрыть токен
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5">
        {items === null && !error ? <Spinner label="Загрузка токенов…" /> : null}
        {items && items.length === 0 ? <p className="text-sm text-muted">Токенов пока нет.</p> : null}
        {items && items.length > 0 ? (
          <ul className="flex flex-col gap-2" aria-label="Список токенов">
            {items.map((item) => (
              <li key={item.id} className="rounded-[12px] border border-border p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{item.name}</h3>
                      <code className="rounded bg-panel-2 px-1.5 py-0.5 font-mono text-xs text-muted">{item.prefix}</code>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${item.scope === 'kp' ? 'border-info text-info' : 'border-border text-muted'}`}>
                        {item.scope === 'kp' ? 'только КП' : 'полный доступ'}
                      </span>
                      {item.revoked_at ? <span className="text-xs text-danger">отозван</span> : null}
                    </div>
                    <dl className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
                      <div>
                        <dt className="inline">Сотрудник: </dt>
                        <dd className="inline text-text">{item.user_name}</dd>
                      </div>
                      <div>
                        <dt className="inline">Создан: </dt>
                        <dd className="inline tabular">{formatDateTime(item.created_at)}</dd>
                      </div>
                      <div>
                        <dt className="inline">Последний запрос: </dt>
                        <dd className="inline tabular">{item.last_used_at ? formatDateTime(item.last_used_at) : 'ещё не использовался'}</dd>
                      </div>
                      <div>
                        <dt className="inline">Срок: </dt>
                        <dd className="inline tabular">{item.expires_at ? formatDateTime(item.expires_at) : 'без срока'}</dd>
                      </div>
                    </dl>
                  </div>
                  {item.revoked_at ? (
                    deleteId === item.id ? (
                      <div className="flex shrink-0 flex-col gap-2">
                        <p className="max-w-xs text-sm">Удалить отозванный «{item.name}» из списка навсегда? Действие не отменить.</p>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="danger" disabled={busy} onClick={() => void remove(item.id)}>
                            Удалить
                          </Button>
                          <Button variant="outline" onClick={() => setDeleteId(null)}>
                            Отмена
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button variant="outline" className="shrink-0" onClick={() => setDeleteId(item.id)}>
                        Удалить
                      </Button>
                    )
                  ) : confirmId === item.id ? (
                    <div className="flex shrink-0 flex-col gap-2">
                      <p className="max-w-xs text-sm">Отозвать «{item.name}»? Запросы с ним получат отказ. Запись о токене останется.</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="danger" disabled={busy} onClick={() => void revoke(item.id)}>
                          Отозвать
                        </Button>
                        <Button variant="outline" onClick={() => setConfirmId(null)}>
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" className="shrink-0" onClick={() => setConfirmId(item.id)}>
                      Отозвать
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
          <p className="text-sm text-danger">{error}</p>
          {items === null ? (
            <Button type="button" variant="outline" onClick={() => void load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось загрузить токены'))}>
              Повторить
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
