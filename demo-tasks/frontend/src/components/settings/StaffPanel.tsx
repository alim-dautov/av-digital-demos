import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Input } from '../ui'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { MODULES } from '../../lib/modules'

type Staff = {
  id: number
  name: string
  display_name: string
  username: string | null
  role: string
  deleted: boolean
  modules: string[]
  see_all_tasks: boolean
  position: string | null
}

const MIN_PASSWORD = 8

export function StaffPanel() {
  const { user } = useAuth()
  const [items, setItems] = useState<Staff[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reset, setReset] = useState('')

  async function load() {
    const data = await api<{ items: Staff[] }>('/staff')
    setItems(data.items)
  }

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось загрузить сотрудников'))
  }, [])

  const current = items.find((item) => item.id === selected) ?? null
  const [position, setPosition] = useState('')
  useEffect(() => {
    setPosition(current?.position ?? '')
  }, [current?.id, current?.position])

  async function savePosition(e: FormEvent) {
    e.preventDefault()
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api<Staff>(`/staff/${current.id}`, { method: 'PATCH', body: JSON.stringify({ position }) })
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить должность')
    } finally {
      setBusy(false)
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const created = await api<Staff>('/staff', {
        method: 'POST',
        body: JSON.stringify({ name, username, password, modules: ['dashboard', 'tasks', 'sales'] }),
      })
      setName('')
      setUsername('')
      setPassword('')
      await load()
      setSelected(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать сотрудника')
    } finally {
      setBusy(false)
    }
  }

  async function saveAccess(modules: string[], seeAllTasks: boolean) {
    if (!current) return
    setError(null)
    try {
      const updated = await api<Staff>(`/staff/${current.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ modules, see_all_tasks: seeAllTasks }),
      })
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить доступ')
    }
  }

  async function remove() {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      const updated = await api<Staff>(`/staff/${current.id}`, { method: 'DELETE' })
      setConfirmDelete(false)
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить сотрудника')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault()
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      await api(`/staff/${current.id}/password`, { method: 'POST', body: JSON.stringify({ password: reset }) })
      setReset('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить пароль')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <h2 className="font-semibold">Сотрудники</h2>
      <p className="mt-1 text-sm text-muted">Имя, логин и начальный пароль. Разделы и доступ ко всем задачам — в карточке.</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={create}>
        <label className="text-sm text-muted">
          Имя
          <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="text-sm text-muted">
          Логин
          <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} autoCapitalize="none" required />
        </label>
        <label className="text-sm text-muted">
          Начальный пароль
          <Input className="mt-1" type="password" minLength={MIN_PASSWORD} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={busy}>
            Добавить
          </Button>
        </div>
      </form>
      <div className="mt-5 grid gap-4 lg:grid-cols-[240px_1fr]">
        <ul className="flex flex-col gap-1" aria-label="Список сотрудников">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setSelected(item.id)
                  setConfirmDelete(false)
                }}
                className={`flex min-h-11 w-full items-center rounded-[9px] px-3 text-left text-sm ${selected === item.id ? 'bg-accent-soft text-text' : 'text-muted hover:bg-panel-2 hover:text-text'}`}
              >
                <span className="truncate">{item.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
        {current ? (
          <div className="rounded-[12px] border border-border p-4">
            <h3 className="font-medium">{current.display_name}</h3>
            <p className="mt-1 text-sm text-muted">{current.username ?? current.role}</p>
            {current.role !== 'superadmin' && !current.deleted ? (
              <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={savePosition}>
                <label className="flex-1 text-sm text-muted">
                  Должность (для табеля)
                  <Input className="mt-1" maxLength={128} value={position} onChange={(e) => setPosition(e.target.value)} placeholder="например, менеджер" />
                </label>
                <div className="flex items-end">
                  <Button type="submit" variant="outline" disabled={busy || position.trim() === (current.position ?? '')}>
                    Сохранить
                  </Button>
                </div>
              </form>
            ) : null}
            {current.role !== 'owner' && current.role !== 'superadmin' && !current.deleted ? (
              <fieldset className="mt-4">
                <legend className="text-sm text-muted">Модули</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {MODULES.map((mod) => (
                    <label key={mod.id} className="flex min-h-11 items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={current.modules.includes(mod.id)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...current.modules, mod.id]
                            : current.modules.filter((id) => id !== mod.id)
                          void saveAccess(next, current.see_all_tasks)
                        }}
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {current.role !== 'owner' && current.role !== 'superadmin' && !current.deleted ? (
              <label className="mt-4 flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={current.see_all_tasks}
                  onChange={(e) => void saveAccess(current.modules, e.target.checked)}
                />
                Доступ ко всем задачам
              </label>
            ) : null}
            {current.role !== 'owner' && current.role !== 'superadmin' && !current.deleted ? (
              <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={resetPassword}>
                <label className="flex-1 text-sm text-muted">
                  Новый временный пароль
                  <Input className="mt-1" type="password" minLength={MIN_PASSWORD} value={reset} onChange={(e) => setReset(e.target.value)} required />
                </label>
                <div className="flex items-end">
                  <Button type="submit" variant="outline" disabled={busy}>
                    Сбросить пароль
                  </Button>
                </div>
              </form>
            ) : null}
            {!current.deleted && current.id !== user?.id ? (
              <div className="mt-4">
                {confirmDelete ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm">Удалить {current.display_name}? Сделки и задачи останутся.</p>
                    <Button variant="outline" disabled={busy} onClick={() => void remove()}>
                      Удалить
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmDelete(false)}>
                      Отмена
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" onClick={() => setConfirmDelete(true)}>
                    Удалить сотрудника
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted">Выберите сотрудника, чтобы открыть карточку.</p>
        )}
      </div>
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  )
}
