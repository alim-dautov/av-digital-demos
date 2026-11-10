import clsx from 'clsx'
import { Pencil, Repeat, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import {
  PRIORITY_LABEL,
  WEEKDAY_SHORT,
  formatDateTime,
  useTeamUsers,
  loadWorkCalendar,
  type KpiIndicator,
  type TaskRecurrence,
  type TaskTemplate,
} from '../../lib/tasks'
import { AssigneePicker } from './AssigneePicker'
import { BottomSheet, Button, Card, ErrorState, Field, Input, Select, Spinner, Textarea } from '../ui'

type TemplateDraft = {
  id?: number
  title: string
  description: string
  priority: string
  checklist: string
  due_in_hours: string
  requires_file: boolean
  requires_photo: boolean
  requires_checklist: boolean
  kpi_key: string
}

const PROOF_OPTIONS = [
  ['requires_file', 'Файл'],
  ['requires_photo', 'Фото'],
  ['requires_checklist', 'Весь чеклист'],
] as const
type RecurrenceDraft = {
  id?: number
  template_id: string
  assignee_ids: number[]
  rule: TaskRecurrence['rule']
  weekdays: number[]
  month_day: string
  run_time: string
  due_time: string
  skip_non_working: boolean
  is_active: boolean
}

function describeRule(r: TaskRecurrence): string {
  let text: string
  if (r.rule === 'daily') text = `Каждый день в ${r.run_time}`
  else if (r.rule === 'monthly') text = `Каждый месяц ${r.month_day}-го в ${r.run_time}`
  else if (r.weekdays.join() === '1,2,3,4,5') text = `По будням в ${r.run_time}`
  else text = `${r.weekdays.map((d) => WEEKDAY_SHORT[d - 1]).join(', ')} в ${r.run_time}`
  if (r.due_time) text += `, срок до ${r.due_time}`
  if (r.skip_non_working) text += ' · без выходных и праздников'
  return text
}

export function TemplatesPanel({ onUse }: { onUse: (templateId: number) => void }) {
  const { can, user } = useAuth()
  const editable = can('tasks', 'update')
  const users = useTeamUsers()
  const [templates, setTemplates] = useState<TaskTemplate[] | null>(null)
  const [recurrences, setRecurrences] = useState<TaskRecurrence[]>([])
  const [error, setError] = useState<string | null>(null)
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null)
  const [recurrenceDraft, setRecurrenceDraft] = useState<RecurrenceDraft | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [indicators, setIndicators] = useState<KpiIndicator[]>([])

  useEffect(() => {
    void loadWorkCalendar()
      .then((c) => setIndicators(c.kpi_indicators))
      .catch(() => setIndicators([]))
  }, [])

  const load = useCallback(async () => {
    setError(null)
    try {
      const [t, r] = await Promise.all([
        api<{ items: TaskTemplate[] }>('/task-templates'),
        api<{ items: TaskRecurrence[] }>('/task-recurrences'),
      ])
      setTemplates(t.items)
      setRecurrences(r.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить шаблоны')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save(request: () => Promise<unknown>, close: () => void) {
    setBusy(true)
    setFormError(null)
    try {
      await request()
      close()
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!templates) return <Spinner />

  return (
    <div className="grid gap-6">
      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Шаблоны · {templates.length}</h2>
          {editable ? (
            <Button
              variant="outline"
              onClick={() => {
                setFormError(null)
                setTemplateDraft({
                  title: '',
                  description: '',
                  priority: 'medium',
                  checklist: '',
                  due_in_hours: '8',
                  requires_file: false,
                  requires_photo: false,
                  requires_checklist: false,
                  kpi_key: '',
                })
              }}
            >
              + Новый шаблон
            </Button>
          ) : null}
        </div>
        {templates.length === 0 ? <Card className="p-6 text-center text-sm text-muted">Шаблонов пока нет</Card> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{t.title}</div>
                {editable ? (
                  <div className="flex shrink-0">
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center text-muted hover:text-text"
                      aria-label={`Изменить шаблон «${t.title}»`}
                      onClick={() => {
                        setFormError(null)
                        setTemplateDraft({
                          id: t.id,
                          title: t.title,
                          description: t.description || '',
                          priority: t.priority,
                          checklist: t.checklist.join('\n'),
                          due_in_hours: String(t.due_in_hours),
                          requires_file: !!t.requires_file,
                          requires_photo: !!t.requires_photo,
                          requires_checklist: !!t.requires_checklist,
                          kpi_key: t.kpi_key || '',
                        })
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
                      aria-label={`Архивировать шаблон «${t.title}»`}
                      onClick={async () => {
                        if (!window.confirm(`Архивировать шаблон «${t.title}»? Его расписания тоже остановятся.`)) return
                        await api(`/task-templates/${t.id}`, { method: 'DELETE' })
                        await load()
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                <span>{PRIORITY_LABEL[t.priority]}</span>
                <span>Срок: {t.due_in_hours} ч</span>
                <span>Чеклист: {t.checklist.length}</span>
                {t.kpi_key ? <span className="text-accent">KPI: {indicators.find((i) => i.key === t.kpi_key)?.title ?? t.kpi_key}</span> : null}
              </div>
              {t.requires_file || t.requires_photo || t.requires_checklist ? (
                <div className="text-xs text-muted">
                  Подтверждение: {PROOF_OPTIONS.filter(([k]) => t[k]).map(([, l]) => l.toLowerCase()).join(', ')}
                </div>
              ) : null}
              {t.description ? <p className="line-clamp-2 text-xs text-muted">{t.description}</p> : null}
              <button type="button" className="mt-auto min-h-11 self-start text-sm font-medium text-accent hover:underline" onClick={() => onUse(t.id)}>
                Создать задачу по шаблону
              </button>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Повторяющиеся задачи · {recurrences.length}</h2>
          {editable && templates.length > 0 ? (
            <Button
              variant="outline"
              onClick={() => {
                setFormError(null)
                setRecurrenceDraft({
                  template_id: String(templates[0].id),
                  assignee_ids: user?.id ? [user.id] : [],
                  rule: 'weekly',
                  weekdays: [1, 2, 3, 4, 5],
                  month_day: '1',
                  run_time: '09:00',
                  due_time: '18:00',
                  skip_non_working: true,
                  is_active: true,
                })
              }}
            >
              + Расписание
            </Button>
          ) : null}
        </div>
        <Card className="overflow-hidden">
          {recurrences.length === 0 ? <div className="p-6 text-center text-sm text-muted">Расписаний нет</div> : null}
          {recurrences.map((r) => (
            <div key={r.id} className={clsx('flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0', !r.is_active && 'opacity-60')}>
              <Repeat className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1 basis-48">
                <div className="font-medium">{r.template_title}</div>
                <div className="text-xs text-muted">
                  {describeRule(r)} · {(r.assignees && r.assignees.length > 0 ? r.assignees.map((a) => a.name).join(', ') : r.assignee_name)}
                </div>
              </div>
              <div className="text-xs text-muted">
                {r.is_active ? `Следующая: ${formatDateTime(r.next_run_at)}` : 'Остановлено'}
              </div>
              {editable ? (
                <div className="flex">
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center text-muted hover:text-text"
                    aria-label="Изменить расписание"
                    onClick={() => {
                      setFormError(null)
                      setRecurrenceDraft({
                        id: r.id,
                        template_id: String(r.template_id),
                        assignee_ids: r.assignees && r.assignees.length > 0 ? r.assignees.map((a) => a.id) : [r.assignee_id],
                        rule: r.rule,
                        weekdays: r.weekdays,
                        month_day: String(r.month_day ?? 1),
                        run_time: r.run_time,
                        due_time: r.due_time || '',
                        skip_non_working: !!r.skip_non_working,
                        is_active: r.is_active,
                      })
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
                    aria-label="Удалить расписание"
                    onClick={async () => {
                      if (!window.confirm('Удалить расписание? Уже созданные задачи останутся.')) return
                      await api(`/task-recurrences/${r.id}`, { method: 'DELETE' })
                      await load()
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      </section>

      <BottomSheet open={!!templateDraft} title={templateDraft?.id ? 'Шаблон' : 'Новый шаблон'} persistent onClose={() => setTemplateDraft(null)}>
        {templateDraft ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              const body = JSON.stringify({
                ...templateDraft,
                due_in_hours: Number(templateDraft.due_in_hours),
                checklist: templateDraft.checklist.split('\n').map((s) => s.trim()).filter(Boolean),
                kpi_key: templateDraft.kpi_key || null,
              })
              void save(
                () =>
                  templateDraft.id
                    ? api(`/task-templates/${templateDraft.id}`, { method: 'PUT', body })
                    : api('/task-templates', { method: 'POST', body }),
                () => setTemplateDraft(null),
              )
            }}
          >
            <Field label="Название">
              <Input value={templateDraft.title} onChange={(e) => setTemplateDraft({ ...templateDraft, title: e.target.value })} required />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Приоритет">
                <Select value={templateDraft.priority} onChange={(e) => setTemplateDraft({ ...templateDraft, priority: e.target.value })}>
                  {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Срок, часов">
                <Input
                  type="number"
                  min={1}
                  max={744}
                  value={templateDraft.due_in_hours}
                  onChange={(e) => setTemplateDraft({ ...templateDraft, due_in_hours: e.target.value })}
                  required
                />
              </Field>
            </div>
            <Field label="Описание">
              <Textarea value={templateDraft.description} onChange={(e) => setTemplateDraft({ ...templateDraft, description: e.target.value })} />
            </Field>
            <Field label="Чеклист — по пункту на строку">
              <Textarea value={templateDraft.checklist} onChange={(e) => setTemplateDraft({ ...templateDraft, checklist: e.target.value })} />
            </Field>
            <fieldset className="grid gap-1">
              <legend className="mb-1 text-xs text-muted">Без чего нельзя сдать на проверку</legend>
              <div className="flex flex-wrap gap-x-4">
                {PROOF_OPTIONS.map(([key, label]) => (
                  <label key={key} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--color-accent)]"
                      checked={templateDraft[key]}
                      onChange={(e) => setTemplateDraft({ ...templateDraft, [key]: e.target.checked })}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Показатель KPI">
              <Select value={templateDraft.kpi_key} onChange={(e) => setTemplateDraft({ ...templateDraft, kpi_key: e.target.value })}>
                <option value="">Не учитывается в KPI</option>
                {indicators.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.title} · до {i.max_amount.toLocaleString('ru-RU')} ₸
                  </option>
                ))}
              </Select>
            </Field>
            {formError ? <p className="text-sm text-danger" role="alert">{formError}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </form>
        ) : null}
      </BottomSheet>

      <BottomSheet open={!!recurrenceDraft} title={recurrenceDraft?.id ? 'Расписание' : 'Новое расписание'} persistent onClose={() => setRecurrenceDraft(null)}>
        {recurrenceDraft ? (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (recurrenceDraft.assignee_ids.length === 0) {
                setFormError('Выберите хотя бы одного ответственного')
                return
              }
              const body = JSON.stringify({
                ...recurrenceDraft,
                template_id: Number(recurrenceDraft.template_id),
                assignee_ids: recurrenceDraft.assignee_ids,
                month_day: Number(recurrenceDraft.month_day),
                due_time: recurrenceDraft.due_time || null,
              })
              void save(
                () =>
                  recurrenceDraft.id
                    ? api(`/task-recurrences/${recurrenceDraft.id}`, { method: 'PUT', body })
                    : api('/task-recurrences', { method: 'POST', body }),
                () => setRecurrenceDraft(null),
              )
            }}
          >
            <Field label="Шаблон">
              <Select value={recurrenceDraft.template_id} onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, template_id: e.target.value })}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Ответственные">
              <AssigneePicker
                users={users}
                value={recurrenceDraft.assignee_ids}
                onChange={(ids) => setRecurrenceDraft({ ...recurrenceDraft, assignee_ids: ids })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Повтор">
                <Select
                  value={recurrenceDraft.rule}
                  onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, rule: e.target.value as RecurrenceDraft['rule'] })}
                >
                  <option value="daily">Каждый день</option>
                  <option value="weekly">По дням недели / будни</option>
                  <option value="monthly">Раз в месяц</option>
                </Select>
              </Field>
              <Field label="Время">
                <Input type="time" value={recurrenceDraft.run_time} onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, run_time: e.target.value })} required />
              </Field>
            </div>
            <Field label="Срок выполнения — до (необязательно)">
              <Input type="time" value={recurrenceDraft.due_time} onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, due_time: e.target.value })} />
            </Field>
            {recurrenceDraft.rule === 'weekly' ? (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Дни недели">
                {WEEKDAY_SHORT.map((label, i) => {
                  const day = i + 1
                  const on = recurrenceDraft.weekdays.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      className={clsx('min-h-11 min-w-11 rounded-[9px] border text-sm', on ? 'border-accent bg-accent-soft text-accent' : 'border-border text-muted')}
                      onClick={() =>
                        setRecurrenceDraft({
                          ...recurrenceDraft,
                          weekdays: on ? recurrenceDraft.weekdays.filter((d) => d !== day) : [...recurrenceDraft.weekdays, day],
                        })
                      }
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {recurrenceDraft.rule === 'monthly' ? (
              <Field label="День месяца">
                <Input type="number" min={1} max={31} value={recurrenceDraft.month_day} onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, month_day: e.target.value })} />
              </Field>
            ) : null}
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent)]"
                checked={recurrenceDraft.skip_non_working}
                onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, skip_non_working: e.target.checked })}
              />
              Не создавать в выходные и праздники (сотрудникам в отпуске не создаются всегда)
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--color-accent)]"
                checked={recurrenceDraft.is_active}
                onChange={(e) => setRecurrenceDraft({ ...recurrenceDraft, is_active: e.target.checked })}
              />
              Активно
            </label>
            {formError ? <p className="text-sm text-danger" role="alert">{formError}</p> : null}
            <Button type="submit" disabled={busy || recurrenceDraft.assignee_ids.length === 0}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </Button>
          </form>
        ) : null}
      </BottomSheet>
    </div>
  )
}
