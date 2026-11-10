import { Paperclip, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { enqueueOutbox } from '../../lib/outbox'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_TOO_BIG,
  PRIORITY_LABEL,
  formatSize,
  fromInputDateTime,
  localDateKey,
  useTeamUsers,
  type Task,
  type TaskTemplate,
} from '../../lib/tasks'
import { AssigneePicker } from './AssigneePicker'
import { UrgentToggle } from './UrgentToggle'
import { Button, Field, Input, Select, Textarea } from '../ui'

function inputAfterHours(hours: number): string {
  const d = new Date(Date.now() + hours * 3600_000)
  return `${localDateKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function TaskCreateForm({
  defaultDue,
  initialTemplateId,
  onCreated,
  onCancel,
}: {
  defaultDue?: string
  initialTemplateId?: number
  onCreated: (task: Task | null) => void
  onCancel?: () => void
}) {
  const { user } = useAuth()
  const users = useTeamUsers()
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templateId, setTemplateId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignees, setAssignees] = useState<number[]>(user?.id ? [user.id] : [])
  const [priority, setPriority] = useState('medium')
  const [urgent, setUrgent] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [dueAt, setDueAt] = useState(defaultDue || '')
  const [checklist, setChecklist] = useState<string[]>([])
  const [checkItem, setCheckItem] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [createdTask, setCreatedTask] = useState<Task | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const filesLabelId = useId()
  const filesHintId = useId()

  useEffect(() => {
    api<{ items: TaskTemplate[] }>('/task-templates')
      .then((d) => setTemplates(d.items))
      .catch(() => setTemplates([]))
  }, [])

  useEffect(() => {
    if (assignees.length === 0 && user?.id) setAssignees([user.id])
  }, [assignees.length, user?.id])

  useEffect(() => {
    if (initialTemplateId && templates.length > 0) applyTemplate(String(initialTemplateId), templates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, templates])

  function applyTemplate(id: string, list = templates) {
    setTemplateId(id)
    const t = list.find((x) => String(x.id) === id)
    if (!t) return
    setTitle(t.title)
    setDescription(t.description || '')
    setPriority(t.priority)
    setChecklist(t.checklist)
    setDueAt(inputAfterHours(t.due_in_hours))
  }

  function takeFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    const problems: string[] = []
    const next = [...files]
    for (const file of Array.from(list)) {
      if (next.length >= ATTACHMENT_MAX_FILES) {
        problems.push(`Можно прикрепить не больше ${ATTACHMENT_MAX_FILES} файлов`)
        break
      }
      if (file.size > ATTACHMENT_MAX_BYTES) {
        problems.push(`«${file.name}»: ${ATTACHMENT_TOO_BIG}`)
        continue
      }
      if (file.size <= 0) {
        problems.push(`«${file.name}» пустой`)
        continue
      }
      const same = next.some((have) => have.name === file.name && have.size === file.size && have.lastModified === file.lastModified)
      if (!same) next.push(file)
    }
    setFiles(next)
    setError(problems.length > 0 ? problems.join('. ') : null)
  }

  async function uploadFiles(task: Task): Promise<Task> {
    let current = task
    const left: File[] = []
    const failed: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      try {
        current = await api<Task>(`/tasks/${current.id}/attachments`, { method: 'POST', body: form })
      } catch (e) {
        left.push(file)
        const message = e instanceof TypeError ? 'нет связи' : e instanceof Error ? e.message : 'не удалось загрузить'
        failed.push(`«${file.name}»: ${message}`)
      }
    }
    setCreatedTask(current)
    setFiles(left)
    if (failed.length > 0) {
      throw new Error(`Задача ${current.number} создана. Не прикрепились: ${failed.join('; ')}`)
    }
    return current
  }

  async function submit() {
    if (submitting.current) return
    if (createdTask && files.length === 0) {
      onCreated(createdTask)
      return
    }
    submitting.current = true
    const payload = {
      title: title.trim(),
      description: description.trim(),
      assignee_ids: assignees,
      priority,
      is_urgent: urgent ? 1 : 0,
      starts_at: fromInputDateTime(startsAt),
      due_at: fromInputDateTime(dueAt),
      checklist,
      template_id: Number(templateId) || undefined,
    }
    setBusy(true)
    setError(null)
    try {
      let task = createdTask
      if (!task) {
        try {
          task = await api<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) })
        } catch (e) {
          if (e instanceof TypeError) {
            if (files.length > 0) {
              setError('Нет связи. Задачу с файлами нельзя отложить — повторите, когда сеть появится.')
              return
            }
            await enqueueOutbox('create_task', payload)
            onCreated(null)
            return
          }
          throw e
        }
        setCreatedTask(task)
      }
      if (files.length > 0) task = await uploadFiles(task)
      onCreated(task)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось создать задачу')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  function close() {
    if (createdTask) onCreated(createdTask)
    else onCancel?.()
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (busy) return
        if (createdTask || (title.trim() && assignees.length > 0)) void submit()
      }}
    >
      <fieldset disabled={createdTask !== null || busy} className="grid gap-3 border-0 p-0 disabled:opacity-70">
      <UrgentToggle value={urgent} onChange={setUrgent} />
      {templates.length > 0 ? (
        <Field label="Шаблон">
          <Select value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
            <option value="">Без шаблона</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Название">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
      </Field>
      <Field label="Ответственные">
        <AssigneePicker
          users={users}
          known={user ? [{ id: user.id, name: user.name, initials: user.initials, role_name: user.role_name }] : []}
          value={assignees}
          onChange={setAssignees}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Начало">
          <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Срок">
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Приоритет">
          <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Описание">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid gap-2">
        <span className="text-xs text-muted">Чеклист</span>
        {checklist.map((item, i) => (
          <div key={`${item}-${i}`} className="flex min-h-9 items-center gap-2 text-sm">
            <span className="h-4 w-4 shrink-0 rounded-[4px] border border-border" aria-hidden />
            <span className="flex-1">{item}</span>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
              aria-label={`Удалить пункт «${item}»`}
              onClick={() => setChecklist((c) => c.filter((_, idx) => idx !== i))}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input
            placeholder="Новый пункт"
            value={checkItem}
            onChange={(e) => setCheckItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (checkItem.trim()) {
                  setChecklist((c) => [...c, checkItem.trim()])
                  setCheckItem('')
                }
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={!checkItem.trim()}
            onClick={() => {
              setChecklist((c) => [...c, checkItem.trim()])
              setCheckItem('')
            }}
          >
            Добавить
          </Button>
        </div>
      </div>
      </fieldset>
      {createdTask ? (
        <p className="text-sm text-muted">Задача {createdTask.number} создана. Прикрепите оставшиеся файлы или закройте форму.</p>
      ) : null}
      <div className="grid gap-2">
        <span className="text-xs text-muted" id={filesLabelId}>
          Файлы
        </span>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          disabled={busy}
          accept={ATTACHMENT_ACCEPT}
          aria-labelledby={filesLabelId}
          onChange={(e) => {
            takeFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {files.length > 0 ? (
          <ul className="grid gap-1">
            {files.map((file, i) => (
              <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-h-11 items-center gap-2 rounded-[9px] border border-border px-3">
                <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <span className="shrink-0 text-xs text-muted">{formatSize(file.size)}</span>
                <button
                  type="button"
                  className="flex h-11 w-11 items-center justify-center text-muted hover:text-danger"
                  aria-label={`Убрать файл «${file.name}»`}
                  disabled={busy}
                  onClick={() => setFiles((current) => current.filter((_, idx) => idx !== i))}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={busy || files.length >= ATTACHMENT_MAX_FILES}
          aria-describedby={filesHintId}
          onClick={() => fileInput.current?.click()}
        >
          <Paperclip className="h-4 w-4" aria-hidden />
          Прикрепить файлы
        </Button>
        <p id={filesHintId} className="text-xs text-muted">
          До {ATTACHMENT_MAX_FILES} файлов, каждый не больше 10 МБ: изображения, PDF, документы, таблицы.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="submit"
          className="flex-1"
          disabled={busy || (!createdTask && (!title.trim() || assignees.length === 0))}
        >
          {busy ? (createdTask ? 'Прикрепляем…' : 'Создаём…') : createdTask ? (files.length > 0 ? 'Прикрепить файлы' : 'Готово') : 'Создать задачу'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" disabled={busy} onClick={close}>
            {createdTask ? 'Закрыть' : 'Отмена'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
