import { Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { loadWorkCalendar, useTeamUsers, type WorkCalendar } from '../../lib/tasks'
import { TemplatesPanel } from '../tasks/TemplatesPanel'
import { Button, Card, Field, Input, Select } from '../ui'

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })

/** Settings → «Регулярные задачи»: templates, schedules (with KPI and proof) and the work calendar. */
export function RecurringTasksSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (
    <Card className="min-w-0 p-5 lg:col-span-2">
      <h2 className="font-semibold">Регулярные задачи</h2>
      <p className="mt-1 text-sm text-muted">
        Шаблон задаёт, что сделать и какое подтверждение обязательно. Расписание создаёт задачи само — по одной на день, без дублей.
      </p>
      <div className="mt-4">
        <TemplatesPanel onUse={(id) => navigate('/tasks', { state: { templateId: id } })} />
      </div>
      {user?.role === 'owner' ? <WorkCalendarPanel /> : null}
    </Card>
  )
}

function WorkCalendarPanel() {
  const users = useTeamUsers()
  const [data, setData] = useState<WorkCalendar | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [holiday, setHoliday] = useState({ day: '', title: '' })
  const [vacation, setVacation] = useState({ user_id: '', starts_on: '', ends_on: '', note: '' })

  const load = useCallback(async () => {
    try {
      setData(await loadWorkCalendar())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить календарь')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function run(request: () => Promise<unknown>, reset?: () => void) {
    setError(null)
    try {
      await request()
      reset?.()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить')
    }
  }

  return (
    <div className="mt-6 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
      <section className="grid content-start gap-2">
        <h3 className="text-sm font-semibold">Праздники</h3>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => api('/work-calendar/holidays', { method: 'POST', body: JSON.stringify(holiday) }), () => setHoliday({ day: '', title: '' }))
          }}
        >
          <Field label="Дата">
            <Input type="date" value={holiday.day} onChange={(e) => setHoliday({ ...holiday, day: e.target.value })} required />
          </Field>
          <Field label="Название">
            <Input value={holiday.title} onChange={(e) => setHoliday({ ...holiday, title: e.target.value })} placeholder="Наурыз" />
          </Field>
          <Button type="submit" variant="outline">Добавить</Button>
        </form>
        <ul className="grid gap-1 text-sm">
          {data?.holidays.length === 0 ? <li className="text-muted">Праздников не добавлено</li> : null}
          {data?.holidays.map((h) => (
            <li key={h.day} className="flex items-center justify-between gap-2 border-t border-border pt-1">
              <span>
                {fmt(h.day)} {h.title ? <span className="text-muted">· {h.title}</span> : null}
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
                aria-label={`Удалить праздник ${h.day}`}
                onClick={() => void run(() => api(`/work-calendar/holidays/${h.day}`, { method: 'DELETE' }))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid content-start gap-2">
        <h3 className="text-sm font-semibold">Отпуска сотрудников</h3>
        <form
          className="grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void run(
              () => api('/work-calendar/vacations', { method: 'POST', body: JSON.stringify({ ...vacation, user_id: Number(vacation.user_id) }) }),
              () => setVacation({ user_id: '', starts_on: '', ends_on: '', note: '' }),
            )
          }}
        >
          <Field label="Сотрудник">
            <Select value={vacation.user_id} onChange={(e) => setVacation({ ...vacation, user_id: e.target.value })} required>
              <option value="">Выберите</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Комментарий">
            <Input value={vacation.note} onChange={(e) => setVacation({ ...vacation, note: e.target.value })} />
          </Field>
          <Field label="С">
            <Input type="date" value={vacation.starts_on} onChange={(e) => setVacation({ ...vacation, starts_on: e.target.value })} required />
          </Field>
          <Field label="По">
            <Input type="date" value={vacation.ends_on} onChange={(e) => setVacation({ ...vacation, ends_on: e.target.value })} required />
          </Field>
          <Button type="submit" variant="outline" className="sm:col-span-2 sm:justify-self-start">Добавить отпуск</Button>
        </form>
        <ul className="grid gap-1 text-sm">
          {data?.vacations.length === 0 ? <li className="text-muted">Отпусков нет</li> : null}
          {data?.vacations.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 border-t border-border pt-1">
              <span>
                {v.user_name} <span className="text-muted">· {fmt(v.starts_on)} — {fmt(v.ends_on)}</span>
              </span>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
                aria-label={`Удалить отпуск ${v.user_name}`}
                onClick={() => void run(() => api(`/work-calendar/vacations/${v.id}`, { method: 'DELETE' }))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      {error ? <p className="text-sm text-danger md:col-span-2" role="alert">{error}</p> : null}
    </div>
  )
}
