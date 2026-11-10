import { Check, Copy } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Input, Select } from '../ui'
import { api } from '../../lib/api'
import { ApiTokensPanel } from './ApiTokensPanel'

type Settings = {
  webhook_url: string
  webhook_key_set: boolean
  webhook_auth: 'raw' | 'bearer'
  mcp_url: string
  encryption_ready: boolean
  encryption_source: string
  encryption_hint: string | null
}

type TestResult = { ok: boolean; http_status: number; error: string }

export function GrokBotSettings() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [url, setUrl] = useState('')
  const [auth, setAuth] = useState<'raw' | 'bearer'>('raw')
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancel = false
    void api<Settings>('/grok/settings')
      .then((data) => {
        if (cancel) return
        setSettings(data)
        setUrl(data.webhook_url)
        setAuth(data.webhook_auth)
      })
      .catch((err: unknown) => {
        if (!cancel) setError(err instanceof Error ? err.message : 'Не удалось загрузить настройки')
      })
    return () => {
      cancel = true
    }
  }, [])

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const data = await api<Settings>('/grok/settings', {
        method: 'PUT',
        body: JSON.stringify({
          webhook_url: url,
          webhook_auth: auth,
          webhook_key: key,
        }),
      })
      setSettings(data)
      setKey('')
      setNotice('Сохранено')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  async function clearKey() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const data = await api<Settings>('/grok/settings', {
        method: 'PUT',
        body: JSON.stringify({ clear_webhook_key: true }),
      })
      setSettings(data)
      setKey('')
      setNotice('Ключ убран')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать ключ')
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await api<TestResult>('/grok/test', {
        method: 'POST',
        body: JSON.stringify({ webhook_url: url, webhook_auth: auth, webhook_key: key }),
      })
      setNotice(result.ok ? `Связь есть, ответ HTTP ${result.http_status}` : `Нет связи${result.error ? `: ${result.error}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Проверка не выполнена')
    } finally {
      setBusy(false)
    }
  }

  async function copyUrl() {
    if (!settings) return
    try {
      await navigator.clipboard.writeText(settings.mcp_url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Не удалось скопировать адрес')
    }
  }

  const encryptionNote =
    settings?.encryption_ready === false
      ? settings.encryption_hint
      : settings?.encryption_source === 'file'
        ? 'Секрет вебхука шифруется ключом из файла storage/grok.key. Сохраните копию этого файла вне сайта: без него сохранённый ключ не прочитать.'
        : settings?.encryption_ready
          ? 'Секрет вебхука шифруется ключом из конфигурации сервера.'
          : null

  return (
    <>
      <Card className="min-w-0 p-5 lg:col-span-2">
        <h2 className="font-semibold">Grok Bot</h2>
        <p className="mt-1 text-sm text-muted">
          Мини-чат на всех страницах отправляет команду на вебхук. Ответ бот записывает через MCP. Токен выпускается в блоке «Токены API» ниже.
        </p>
        {settings ? (
          <div className="mt-4 rounded-[12px] border border-border p-3">
            <p className="text-xs text-muted">Адрес MCP</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 break-all text-sm">{settings.mcp_url}</code>
              <Button type="button" variant="outline" className="shrink-0" onClick={() => void copyUrl()}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? 'Скопировано' : 'Скопировать'}
              </Button>
            </div>
          </div>
        ) : null}
        <form className="mt-4 grid gap-3" onSubmit={save}>
          <label className="text-sm text-muted">
            Адрес вебхука
            <Input className="mt-1" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" inputMode="url" autoCapitalize="none" />
          </label>
          <label className="text-sm text-muted">
            Заголовок Authorization
            <Select className="mt-1 w-full" value={auth} aria-label="Формат ключа вебхука" onChange={(event) => setAuth(event.target.value === 'bearer' ? 'bearer' : 'raw')}>
              <option value="raw">Ключ как есть: Authorization: &lt;ключ&gt;</option>
              <option value="bearer">Bearer: Authorization: Bearer &lt;ключ&gt;</option>
            </Select>
          </label>
          <label className="text-sm text-muted">
            Ключ вебхука
            <Input
              className="mt-1"
              type="password"
              value={key}
              autoComplete="new-password"
              placeholder={settings?.webhook_key_set ? 'задан' : 'Вставьте ключ'}
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            {settings?.webhook_key_set ? 'Ключ задан. Пустое поле его не меняет и не показывает.' : 'Ключ не задан. В интерфейс он больше не вернётся.'}
          </p>
          {encryptionNote ? <p className="text-sm text-muted">{encryptionNote}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || settings === null}>
              Сохранить
            </Button>
            <Button type="button" variant="outline" disabled={busy || settings === null} onClick={() => void test()}>
              Проверить связь
            </Button>
            {settings?.webhook_key_set ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void clearKey()}>
                Убрать ключ
              </Button>
            ) : null}
          </div>
        </form>
        {notice ? (
          <p className="mt-3 text-sm text-muted" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      <ApiTokensPanel />
    </>
  )
}
