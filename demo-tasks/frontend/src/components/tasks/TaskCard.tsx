import clsx from 'clsx'
import { Check, Download, Paperclip, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../lib/api'
import { activeMention } from '../../lib/mentions'
import { notifyTaskSeen } from '../../lib/unseenTasks'
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_FILES,
  ATTACHMENT_TOO_BIG,
  HISTORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  taskAssignees,
  STATUS_TONE,
  isUrgent,
  formatDateTime,
  formatSize,
  fromInputDateTime,
  historyValue,
  toInputDateTime,
  useTeamUsers,
  type CommentAttachment,
  type TaskComment,
  type TaskDetail,
} from '../../lib/tasks'
import { Button, Drawer, ErrorState, Field, Input, Select, Spinner, Textarea } from '../ui'
import { AssigneePicker } from './AssigneePicker'
import { UrgentBadge, UrgentToggle } from './UrgentToggle'
import { ReasonDialog, type ReasonKind, type ReasonPayload } from './ReasonDialog'

type Props = {
  taskId: number | null
  onClose: () => void
  onChanged: () => void
}

export function TaskCard({ taskId, onClose, onChanged }: Props) {
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reason, setReason] = useState<ReasonKind | null>(null)

  useEffect(() => {
    if (!taskId) {
      setTask(null)
      return
    }
    let alive = true
    setLoading(true)
    setError(null)
    setActionError(null)
    api<TaskDetail>(`/tasks/${taskId}`)
      .then((data) => {
        notifyTaskSeen(taskId)
        if (alive) setTask(data)
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'Не удалось загрузить задачу'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [taskId])

  async function run(request: Promise<TaskDetail>) {
    setActionError(null)
    try {
      setTask(await request)
      onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Не удалось сохранить')
      throw e
    }
  }

  const patch = (fields: Record<string, unknown>) =>
    run(api<TaskDetail>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(fields) })).catch(() => undefined)

  const transition = (payload: ReasonPayload) =>
    run(api<TaskDetail>(`/tasks/${taskId}/transition`, { method: 'POST', body: JSON.stringify(payload) }))

  return (
    <Drawer open={taskId !== null} title={task?.number || 'Задача'} onClose={onClose} wide persistent>
      {loading && !task ? <Spinner /> : null}
      {error ? <ErrorState message={error} /> : null}
      {task ? (
        <TaskCardBody
          task={task}
          actionError={actionError}
          patch={patch}
          transition={(payload) => transition(payload).catch(() => undefined)}
          openReason={setReason}
          run={(request) => run(request).catch(() => undefined)}
          onDeleted={() => {
            onChanged()
            onClose()
          }}
        />
      ) : null}
      <ReasonDialog kind={reason} onClose={() => setReason(null)} onSubmit={transition} />
    </Drawer>
  )
}

function TaskCardBody({
  task,
  actionError,
  patch,
  transition,
  openReason,
  run,
  onDeleted,
}: {
  task: TaskDetail
  actionError: string | null
  patch: (fields: Record<string, unknown>) => Promise<void>
  transition: (payload: ReasonPayload) => Promise<void>
  openReason: (kind: ReasonKind) => void
  run: (request: Promise<TaskDetail>) => Promise<void>
  onDeleted: () => void
}) {
  const users = useTeamUsers()
  const editable = task.can.edit
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')

  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description || '')
  }, [task.id, task.title, task.description])

  const urgent = isUrgent(task)
  return (
    <div
      className={clsx(
        'grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 text-sm [overflow-wrap:anywhere] [&>*]:min-w-0',
        urgent && '-mx-1 rounded-[14px] border-2 border-[#7f1d1d] bg-[#dc2626] p-3 text-white [&_a]:text-white [&_.text-danger]:text-white [&_.text-muted]:text-white/85',
      )}
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {urgent ? <UrgentBadge /> : null}
          <span className={clsx('inline-flex items-center gap-1.5 font-medium', !urgent && STATUS_TONE[task.status], urgent && 'text-white')}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {STATUS_LABEL[task.status]}
          </span>
          {task.is_overdue ? <span className={urgent ? 'text-white' : 'text-danger'}>Просрочена</span> : null}
          {task.recurrence_id ? <span className="text-muted">Повторяющаяся</span> : null}
          {task.kpi_key ? <span className="text-accent">KPI</span> : null}
          {task.was_late && !task.is_overdue && task.status !== 'cancelled' ? <span className="text-danger">Сдана с опозданием</span> : null}
        </div>
        <UrgentToggle
          value={urgent}
          disabled={!editable}
          onChange={(next) => void patch({ is_urgent: next ? 1 : 0 })}
        />
        <AutoTextarea
          aria-label="Название"
          rows={1}
          className="!min-h-11 resize-none py-2.5 text-base font-semibold break-words [overflow-wrap:anywhere]"
          value={title}
          disabled={!editable}
          onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, ' '))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          onBlur={() => title.trim() && title !== task.title && void patch({ title })}
        />
      </div>

      <StatusActions task={task} transition={transition} openReason={openReason} />

      {actionError ? (
        <p className="rounded-[9px] bg-danger/10 px-3 py-2 text-danger" role="alert">
          {actionError}
        </p>
      ) : null}

      {task.status === 'cancelled' && task.cancel_reason ? (
        <div className="rounded-[10px] border border-border bg-panel-2 px-3 py-2 text-muted">Причина отмены: {task.cancel_reason}</div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <div className="sm:col-span-2">
          <Field label="Ответственные">
            <AssigneePicker
              users={users}
              known={taskAssignees(task)}
              disabled={!editable}
              value={taskAssignees(task).map((person) => person.id)}
              onChange={(ids) => void patch({ assignee_ids: ids })}
            />
          </Field>
        </div>
        <Field label="Приоритет">
          <Select value={task.priority} disabled={!editable} onChange={(e) => void patch({ priority: e.target.value })}>
            {Object.entries(PRIORITY_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Постановщик">
          <Input value={task.creator_name || '—'} disabled />
        </Field>
        <Field label="Начало">
          <DateTimeInput value={task.starts_at} disabled={!editable} onCommit={(v) => patch({ starts_at: v })} />
        </Field>
        <Field label="Срок">
          <DateTimeInput
            value={task.due_at}
            className={clsx(task.is_overdue && 'border-danger text-danger')}
            disabled={!editable}
            onCommit={(v) => patch({ due_at: v })}
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
        <span>Создана: {formatDateTime(task.created_at)}</span>
        {task.completed_at ? <span>Выполнена: {formatDateTime(task.completed_at)}</span> : null}
        {task.deal ? (
          <Link className="text-accent hover:underline" to={`/sales?deal=${task.deal.id}`}>
            Сделка {task.deal.number}: {task.deal.title}
          </Link>
        ) : null}
      </div>

      <Field label="Описание">
        <AutoTextarea
          className="break-words [overflow-wrap:anywhere]"
          value={description}
          disabled={!editable}
          placeholder="Что нужно сделать и какой результат ожидается"
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description || '') && void patch({ description })}
        />
      </Field>

      <Checklist task={task} run={run} />
      <Attachments task={task} editable={editable} run={run} />
      <Comments task={task} run={run} />
      <History task={task} />

      {task.can.delete ? (
        <div className="border-t border-border pt-4">
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm(`Удалить задачу ${task.number}? Это действие нельзя отменить.`)) return
              await api(`/tasks/${task.id}`, { method: 'DELETE' })
              onDeleted()
            }}
          >
            <Trash2 className="h-4 w-4" aria-hidden /> Удалить задачу
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Textarea that grows with its content so long titles and descriptions stay fully readable. */
function AutoTextarea({ className, value, ...props }: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
    fit()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    observer?.observe(el)
    return () => observer?.disconnect()
  }, [value])
  return <Textarea ref={ref} className={clsx('min-w-0 overflow-hidden', className)} value={value} {...props} />
}

function DateTimeInput({
  id,
  value,
  disabled,
  className,
  onCommit,
}: {
  id?: string
  value: string | null
  disabled: boolean
  className?: string
  onCommit: (value: string | null) => Promise<void>
}) {
  const [draft, setDraft] = useState(toInputDateTime(value))
  useEffect(() => setDraft(toInputDateTime(value)), [value])
  return (
    <Input
      id={id}
      type="datetime-local"
      className={clsx('datetime-input min-w-0 max-w-full', className)}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== toInputDateTime(value) && void onCommit(fromInputDateTime(draft))}
    />
  )
}

function StatusActions({
  task,
  transition,
  openReason,
}: {
  task: TaskDetail
  transition: (payload: ReasonPayload) => Promise<void>
  openReason: (kind: ReasonKind) => void
}) {
  if (!task.can.transition && !task.can.accept) return null
  const go = (status: string) => () => void transition({ status })
  const proof = task.proof
  const needs = proof
    ? [proof.requires_file && 'файл', proof.requires_photo && 'фото', proof.requires_checklist && 'весь чеклист'].filter(Boolean)
    : []
  const blocked = (task.status === 'in_progress' || task.status === 'on_review') && !!proof && proof.missing.length > 0
  return (
    <div className="grid gap-2">
      {needs.length > 0 ? (
        <p className={clsx('text-xs', blocked ? 'text-danger' : 'text-muted')} role={blocked ? 'status' : undefined}>
          Для сдачи нужно: {needs.join(', ')}.
          {blocked ? ` Не хватает: ${proof!.missing.join(', ')}.` : ' Всё приложено.'}
        </p>
      ) : null}
    <div className="flex flex-wrap gap-2">
      {task.status === 'new' ? <Button onClick={go('in_progress')}>Взять в работу</Button> : null}
      {task.status === 'in_progress' ? <Button onClick={go('on_review')}>Отправить на проверку</Button> : null}
      {task.status === 'on_review' && task.can.accept ? <Button onClick={go('done')}>Принять результат</Button> : null}
      {task.status === 'on_review' && task.can.return ? (
        <Button variant="outline" onClick={() => openReason('return')}>
          Вернуть на доработку
        </Button>
      ) : null}
      {task.status === 'on_review' && !task.can.accept ? (
        <span className="self-center text-xs text-muted">Ждёт проверки постановщиком</span>
      ) : null}
      {['new', 'in_progress'].includes(task.status) || (task.status === 'on_review' && task.can.return) ? (
        <Button variant="ghost" className="text-muted" onClick={() => openReason('cancel')}>
          Отменить
        </Button>
      ) : null}
    </div>
    </div>
  )
}

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Checklist({ task, run }: { task: TaskDetail; run: (r: Promise<TaskDetail>) => Promise<void> }) {
  const [item, setItem] = useState('')
  const done = task.checklist.filter((c) => c.is_done).length
  const total = task.checklist.length
  const open = !['done', 'cancelled'].includes(task.status)
  return (
    <Section title={`Чеклист · ${done}/${total}`}>
      {total > 0 ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      ) : null}
      <ul className="grid gap-1">
        {task.checklist.map((c) => (
          <li key={c.id} className="group flex min-h-11 items-center gap-3 rounded-[9px] px-2 hover:bg-panel-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={c.is_done}
              aria-label={c.title}
              disabled={!open}
              className={clsx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border',
                c.is_done ? 'border-success bg-success text-white' : 'border-border',
              )}
              onClick={() =>
                void run(api<TaskDetail>(`/tasks/${task.id}/checklist/${c.id}`, { method: 'POST', body: JSON.stringify({ done: !c.is_done }) }))
              }
            >
              {c.is_done ? <Check className="h-3.5 w-3.5" /> : null}
            </button>
            <span className={clsx('flex-1', c.is_done && 'text-muted line-through')}>{c.title}</span>
            {open ? (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-muted opacity-0 transition group-hover:opacity-100 hover:text-danger focus:opacity-100 pointer-coarse:opacity-100"
                aria-label={`Удалить пункт «${c.title}»`}
                onClick={() => void run(api<TaskDetail>(`/tasks/${task.id}/checklist/${c.id}`, { method: 'DELETE' }))}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {open ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!item.trim()) return
            void run(api<TaskDetail>(`/tasks/${task.id}/checklist`, { method: 'POST', body: JSON.stringify({ title: item }) })).then(() => setItem(''))
          }}
        >
          <Input placeholder="Новый пункт" value={item} onChange={(e) => setItem(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!item.trim()}>
            Добавить
          </Button>
        </form>
      ) : null}
    </Section>
  )
}

function Attachments({ task, editable, run }: { task: TaskDetail; editable: boolean; run: (r: Promise<TaskDetail>) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  return (
    <Section
      title={`Вложения · ${task.attachments.length}`}
      aside={
        editable ? (
          <>
            <input
              ref={input}
              type="file"
              className="hidden"
              accept={ATTACHMENT_ACCEPT}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                if (file.size > ATTACHMENT_MAX_BYTES) {
                  window.alert(ATTACHMENT_TOO_BIG)
                  return
                }
                const form = new FormData()
                form.append('file', file)
                setUploading(true)
                await run(api<TaskDetail>(`/tasks/${task.id}/attachments`, { method: 'POST', body: form }))
                setUploading(false)
              }}
            />
            <Button variant="ghost" className="min-h-9 text-xs" disabled={uploading} onClick={() => input.current?.click()}>
              <Paperclip className="h-4 w-4" aria-hidden /> {uploading ? 'Загрузка…' : 'Прикрепить файл'}
            </Button>
          </>
        ) : null
      }
    >
      {task.attachments.length === 0 ? <p className="text-xs text-muted">Файлов нет. До 10 МБ: изображения, PDF, документы, таблицы.</p> : null}
      <ul className="grid gap-1">
        {task.attachments.map((a) => (
          <li key={a.id} className="flex min-h-11 items-center gap-3 rounded-[9px] border border-border px-3">
            <Paperclip className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-accent">
              {a.name}
            </a>
            <span className="shrink-0 text-xs text-muted">
              {formatSize(a.size)} · {a.user_name}
            </span>
            <a href={a.url} download className="flex h-9 w-9 items-center justify-center text-muted hover:text-text" aria-label={`Скачать ${a.name}`}>
              <Download className="h-4 w-4" />
            </a>
            {editable ? (
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center text-muted hover:text-danger"
                aria-label={`Удалить ${a.name}`}
                onClick={() => window.confirm(`Удалить файл «${a.name}»?`) && void run(api<TaskDetail>(`/attachments/${a.id}`, { method: 'DELETE' }))}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function Comments({ task, run }: { task: TaskDetail; run: (r: Promise<TaskDetail>) => Promise<void> }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  return (
    <Section title={`Комментарии · ${task.comments.length}`}>
      <ul className="grid gap-3">
        {task.comments.map((c) => (
          <CommentItem key={c.id} comment={c} run={run} />
        ))}
      </ul>
      <form
        className="relative grid gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!body.trim() && files.length === 0) return
          const form = new FormData()
          form.append('body', body)
          files.forEach((f) => form.append('files[]', f))
          setSending(true)
          await run(api<TaskDetail>(`/tasks/${task.id}/comments`, { method: 'POST', body: form }))
          setSending(false)
          setBody('')
          setFiles([])
        }}
      >
        <MentionTextarea value={body} onChange={setBody} placeholder="Комментарий. @имя — упомянуть сотрудника" />
        <PendingFiles files={files} onRemove={(i) => setFiles(files.filter((_, j) => j !== i))} />
        <div className="flex items-center justify-between gap-2">
          <FilePickerButton count={files.length} onPick={(picked) => setFiles([...files, ...picked])} />
          <Button type="submit" disabled={(!body.trim() && files.length === 0) || sending}>
            {sending ? 'Отправляем…' : 'Отправить'}
          </Button>
        </div>
      </form>
    </Section>
  )
}

function CommentItem({ comment: c, run }: { comment: TaskComment; run: (r: Promise<TaskDetail>) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(c.body)
  const [removed, setRemoved] = useState<number[]>([])
  const [added, setAdded] = useState<File[]>([])
  const [saving, setSaving] = useState(false)
  const kept = c.attachments.filter((a) => !removed.includes(a.id))

  function reset() {
    setEditing(false)
    setText(c.body)
    setRemoved([])
    setAdded([])
  }

  return (
    <li className="flex gap-3" data-comment-id={c.id}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-panel-2 text-[10px]">{c.initials}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-xs text-muted">
          <span>
            <span className="font-medium text-text">{c.name}</span> · {formatDateTime(c.created_at)}
            {c.edited_at ? <span title={`Изменено ${formatDateTime(c.edited_at)}`}> · изменено</span> : null}
          </span>
          {c.can_edit && !editing ? (
            <button
              type="button"
              className="ml-auto flex h-8 w-8 items-center justify-center text-muted hover:text-text"
              aria-label="Редактировать комментарий"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {editing ? (
          <form
            className="mt-1 grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!text.trim() && kept.length + added.length === 0) return
              const form = new FormData()
              form.append('body', text)
              removed.forEach((id) => form.append('remove_attachments[]', String(id)))
              added.forEach((f) => form.append('files[]', f))
              setSaving(true)
              await run(api<TaskDetail>(`/comments/${c.id}`, { method: 'POST', body: form }))
              setSaving(false)
              reset()
            }}
          >
            <MentionTextarea value={text} onChange={setText} aria-label="Текст комментария" autoFocus />
            <CommentFiles files={kept} onRemove={(id) => setRemoved([...removed, id])} />
            <PendingFiles files={added} onRemove={(i) => setAdded(added.filter((_, j) => j !== i))} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <FilePickerButton count={kept.length + added.length} onPick={(picked) => setAdded([...added, ...picked])} />
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={reset}>
                  Отмена
                </Button>
                <Button type="submit" disabled={saving || (!text.trim() && kept.length + added.length === 0)}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <>
            {c.body ? <p className="mt-1 whitespace-pre-wrap break-words">{highlightMentions(c.body)}</p> : null}
            <CommentFiles files={c.attachments} />
          </>
        )}
      </div>
    </li>
  )
}

function CommentFiles({ files, onRemove }: { files: CommentAttachment[]; onRemove?: (id: number) => void }) {
  if (files.length === 0) return null
  const images = files.filter((f) => f.mime.startsWith('image/'))
  const others = files.filter((f) => !f.mime.startsWith('image/'))
  return (
    <div className="mt-2 grid gap-2">
      {images.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {images.map((f) => (
            <div key={f.id} className="relative">
              <a href={f.url} target="_blank" rel="noreferrer" title={`${f.name} · ${formatSize(f.size)}`}>
                <img src={f.url} alt={f.name} loading="lazy" className="h-20 w-20 rounded-[8px] border border-border object-cover" />
              </a>
              {onRemove ? <RemoveFile name={f.name} onClick={() => onRemove(f.id)} floating /> : null}
            </div>
          ))}
        </div>
      ) : null}
      {others.length > 0 ? (
        <ul className="grid gap-1">
          {others.map((f) => (
            <li key={f.id} className="flex min-h-9 items-center gap-2 rounded-[8px] border border-border px-2 text-xs">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
              <a href={f.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-accent">
                {f.name}
              </a>
              <span className="shrink-0 text-muted">{formatSize(f.size)}</span>
              {onRemove ? (
                <RemoveFile name={f.name} onClick={() => onRemove(f.id)} />
              ) : (
                <a href={f.url} download className="flex h-8 w-8 items-center justify-center text-muted hover:text-text" aria-label={`Скачать ${f.name}`}>
                  <Download className="h-3.5 w-3.5" />
                </a>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function RemoveFile({ name, onClick, floating }: { name: string; onClick: () => void; floating?: boolean }) {
  return (
    <button
      type="button"
      aria-label={`Убрать ${name}`}
      onClick={onClick}
      className={clsx(
        'flex items-center justify-center text-muted hover:text-danger',
        floating ? 'absolute -top-2 -right-2 h-6 w-6 rounded-full border border-border bg-panel' : 'h-8 w-8',
      )}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  )
}

function PendingFiles({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1">
      {files.map((f, i) => (
        <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded-[8px] border border-dashed border-border py-1 pr-1 pl-2 text-xs">
          <Paperclip className="h-3 w-3 text-muted" aria-hidden />
          <span className="max-w-48 truncate">{f.name}</span>
          <span className="text-muted">{formatSize(f.size)}</span>
          <RemoveFile name={f.name} onClick={() => onRemove(i)} />
        </li>
      ))}
    </ul>
  )
}

function FilePickerButton({ count, onPick }: { count: number; onPick: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        accept={ATTACHMENT_ACCEPT}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          e.target.value = ''
          if (picked.some((f) => f.size > ATTACHMENT_MAX_BYTES)) {
            window.alert(ATTACHMENT_TOO_BIG)
            return
          }
          if (count + picked.length > ATTACHMENT_MAX_FILES) {
            window.alert(`К комментарию можно прикрепить не больше ${ATTACHMENT_MAX_FILES} файлов`)
            return
          }
          onPick(picked)
        }}
      />
      <Button type="button" variant="ghost" className="min-h-9 text-xs" disabled={count >= ATTACHMENT_MAX_FILES} onClick={() => input.current?.click()}>
        <Paperclip className="h-4 w-4" aria-hidden /> Файлы
      </Button>
    </>
  )
}

/** Textarea with an @name picker for team members, used for new comments and edits. */
function MentionTextarea({
  value: body,
  onChange: setBody,
  placeholder,
  autoFocus,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  autoFocus?: boolean
  'aria-label'?: string
}) {
  const users = useTeamUsers()
  const [caret, setCaret] = useState(0)
  const area = useRef<HTMLTextAreaElement>(null)

  const mention = useMemo(() => activeMention(body, caret, users), [body, caret, users])

  // Russian layout has no "@" on Shift+2 and phones hide it: one tap inserts it and opens the list.
  function startMention() {
    const el = area.current
    const start = el ? el.selectionStart : body.length
    const end = el ? el.selectionEnd : body.length
    const needsSpace = start > 0 && !/\s/.test(body[start - 1])
    const insert = needsSpace ? ' @' : '@'
    const position = start + insert.length
    setBody(body.slice(0, start) + insert + body.slice(end))
    setCaret(position)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(position, position)
    })
  }


  function insertMention(name: string) {
    if (!mention) return
    const next = `${body.slice(0, mention.at)}@${name} ${body.slice(mention.at + 1 + mention.query.length)}`
    const position = mention.at + name.length + 2
    setBody(next)
    setCaret(position)
    requestAnimationFrame(() => {
      area.current?.focus()
      area.current?.setSelectionRange(position, position)
    })
  }

  return (
    <div className="relative">
      <Textarea
        ref={area}
        className="pr-11"
        value={body}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        onChange={(e) => {
          setBody(e.target.value)
          setCaret(e.target.selectionStart)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyUp={(e) => setCaret(e.currentTarget.selectionStart)}
        onClick={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => {
          if (mention && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault()
            insertMention(mention.matches[0].name)
          }
        }}
      />
      <button
        type="button"
        className="absolute right-1 bottom-1 flex h-9 w-9 items-center justify-center rounded-[8px] text-base font-semibold text-muted hover:bg-panel hover:text-accent"
        aria-label="Упомянуть сотрудника"
        title="Упомянуть сотрудника"
        onMouseDown={(e) => e.preventDefault()}
        onClick={startMention}
      >
        @
      </button>
      {mention ? (
        <ul className="absolute right-0 bottom-full left-0 z-10 mb-1 max-h-60 overflow-y-auto sm:right-auto sm:w-64 rounded-[10px] border border-border bg-panel-2 shadow-lg" role="listbox">
          {mention.matches.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-panel"
                onMouseDown={(e) => {
                  e.preventDefault()
                  insertMention(u.name)
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-bg text-[10px]">{u.initials}</span>
                <span>{u.name}</span>
                <span className="ml-auto text-xs text-muted">{u.role_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function highlightMentions(text: string): ReactNode[] {
  return text.split(/(@[^\s@,.!?]+)/g).map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className="text-accent">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function History({ task }: { task: TaskDetail }) {
  if (task.history.length === 0) return null
  return (
    <Section title="История">
      <ol className="grid gap-2 border-l border-border pl-4">
        {[...task.history].reverse().map((h) => (
          <li key={h.id} className="text-xs">
            <div className="text-muted">
              {formatDateTime(h.created_at)} · {h.user_name || 'Система'}
            </div>
            <div>
              {HISTORY_LABEL[h.field_name] || h.field_name}:{' '}
              {h.old_value ? <span className="text-muted line-through">{historyValue(h.field_name, h.old_value)}</span> : null}
              {h.old_value && h.new_value ? ' → ' : null}
              {h.new_value ? <span>{historyValue(h.field_name, h.new_value)}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </Section>
  )
}
