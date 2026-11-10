import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { promptInstall, useInstallState } from '../components/pwa/PwaPrompts'
import { useAuth } from '../lib/auth'
import { homePath } from '../lib/modules'
import { Button, Card, Input } from '../components/ui'

export function LoginPage() {
  const { user, modules, loading, login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const install = useInstallState()

  if (!loading && user) return <Navigate to={homePath(modules, user.role === 'owner')} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4 pt-[calc(2rem+var(--safe-top))] pb-[calc(2rem+var(--safe-bottom))]">
      <Card className="w-full max-w-md p-6">
        <div className="mb-6 flex items-center gap-2">
          <span className="text-2xl font-bold">DEMO</span>
          <span className="mb-3 h-2.5 w-2.5 rounded-[2px] bg-accent" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Вход в CRM</h1>
        <form className="mt-6 flex flex-col gap-3" onSubmit={onSubmit}>
          <label className="text-sm text-muted">
            Логин или email
            <Input
              className="mt-1"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="text-sm text-muted">
            Пароль
            <Input
              className="mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy} className="mt-2 w-full">
            {busy ? 'Входим…' : 'Войти'}
          </Button>
          {install.standalone ? null : install.prompt ? (
            <Button type="button" variant="outline" className="w-full" onClick={() => void promptInstall()}>
              Установить приложение
            </Button>
          ) : install.ios ? (
            <p className="text-center text-sm text-muted">Поделиться → На экран Домой</p>
          ) : null}
        </form>
      </Card>
    </div>
  )
}
