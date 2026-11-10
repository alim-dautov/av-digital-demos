import clsx from 'clsx'
import { MessageCircle, Mic, Send, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '../ui'
import { api } from '../../lib/api'

type ChatMessage = {
  id: number
  command_id: string
  role: 'user' | 'assistant'
  text: string
  delivery_status: 'pending' | 'sent' | 'failed' | 'skipped' | 'local'
  delivery_error: string | null
  created_at: string
}

type SpeechResult = {
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}

type BrowserSpeech = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResult) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

const VOICE_MS = 20_000
const UNSUPPORTED_HINT = 'Голосовой ввод недоступен в этом браузере. Напишите сообщение текстом.'
const DENIED_HINT = 'Нет доступа к микрофону. Напишите сообщение текстом.'
const RECOGNITION_HINT = 'Не удалось распознать речь. Напишите сообщение текстом.'
const EMPTY_HINT = 'Ничего не распознано. Напишите сообщение текстом.'

function speechCtor(): (new () => BrowserSpeech) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => BrowserSpeech
    webkitSpeechRecognition?: new () => BrowserSpeech
  }
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

function clock(seconds: number): string {
  const safe = Math.min(20, Math.max(0, seconds))
  return `0:${String(safe).padStart(2, '0')}`
}

function deliveryLabel(message: ChatMessage): string | null {
  if (message.role !== 'user') return null
  if (message.delivery_status === 'pending') return 'Отправляется…'
  if (message.delivery_status === 'failed') return message.delivery_error ? `Не доставлено: ${message.delivery_error}` : 'Не доставлено'
  if (message.delivery_status === 'skipped') return 'Бот не подключён'
  return null
}

type MiniChatProps = {
  /** floating: кнопки внизу справа и всплывающая панель; embedded: та же переписка во всю область страницы */
  variant?: 'floating' | 'embedded'
}

export function MiniChat({ variant = 'floating' }: MiniChatProps) {
  const embedded = variant === 'embedded'
  const panelId = useId()
  const [open, setOpen] = useState(embedded)
  const [items, setItems] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const afterRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const speechRef = useRef<BrowserSpeech | null>(null)
  const transcriptRef = useRef('')
  const draftRef = useRef('')
  const session = useRef(0)
  const endReason = useRef<'denied' | 'error' | null>(null)
  const recordingRef = useRef(false)
  const sendingRef = useRef(false)
  const openRef = useRef(false)
  const timers = useRef<{ tick?: number; limit?: number }>({})
  openRef.current = open

  function setRecordingState(value: boolean) {
    recordingRef.current = value
    setRecording(value)
  }

  function clearVoiceTimers() {
    window.clearInterval(timers.current.tick)
    window.clearTimeout(timers.current.limit)
    timers.current.tick = undefined
    timers.current.limit = undefined
  }

  function merge(next: ChatMessage[]) {
    if (next.length === 0) return
    setItems((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]))
      for (const item of next) map.set(item.id, item)
      return [...map.values()].sort((a, b) => a.id - b.id)
    })
    afterRef.current = Math.max(afterRef.current, ...next.map((item) => item.id))
  }

  async function load(reset = false) {
    const after = reset ? 0 : afterRef.current
    const data = await api<{ items: ChatMessage[] }>(`/mini-chat/messages?after_id=${after}`)
    if (reset) {
      setItems((prev) => {
        const map = new Map(data.items.map((item) => [item.id, item]))
        for (const item of prev) if (!map.has(item.id)) map.set(item.id, item)
        return [...map.values()].sort((a, b) => a.id - b.id)
      })
      afterRef.current = Math.max(
        afterRef.current,
        data.items.reduce((max, item) => Math.max(max, item.id), 0),
      )
    } else {
      merge(data.items)
    }
  }

  useEffect(() => {
    if (!open) return
    let stop = false
    setLoading(true)
    setError(null)
    void load(true)
      .catch((err: unknown) => {
        if (!stop) setError(err instanceof Error ? err.message : 'Не удалось открыть чат')
      })
      .finally(() => {
        if (!stop) setLoading(false)
      })
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void load(false).catch(() => undefined)
    }, 3000)
    return () => {
      stop = true
      window.clearInterval(timer)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [open, items])

  useEffect(() => {
    if (!open || embedded) return
    inputRef.current?.focus()
  }, [open, embedded])

  function discardVoice() {
    session.current += 1
    clearVoiceTimers()
    const recognition = speechRef.current
    speechRef.current = null
    transcriptRef.current = ''
    endReason.current = null
    setRecordingState(false)
    setLiveTranscript('')
    setText(draftRef.current)
    if (recognition) {
      try {
        recognition.abort()
      } catch {
        /* распознавание уже остановлено */
      }
    }
    buttonRef.current?.focus()
  }

  const discardRef = useRef(discardVoice)
  discardRef.current = discardVoice

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (recordingRef.current) {
        event.preventDefault()
        discardRef.current()
        return
      }
      if (openRef.current && !embedded) {
        event.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [embedded])

  useEffect(() => {
    return () => {
      session.current += 1
      clearVoiceTimers()
      speechRef.current?.abort()
    }
  }, [])

  async function sendText(value: string) {
    const body = value.trim()
    if (!body || sendingRef.current) return
    sendingRef.current = true
    setSending(true)
    setError(null)
    setText('')
    try {
      const data = await api<{ message: ChatMessage }>('/mini-chat/messages', {
        method: 'POST',
        body: JSON.stringify({ text: body }),
      })
      merge([data.message])
    } catch (err) {
      setText(body)
      setError(err instanceof Error ? err.message : 'Не удалось отправить')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function stopVoice() {
    try {
      speechRef.current?.stop()
    } catch {
      /* распознавание уже остановлено */
    }
  }

  function startVoice() {
    if (recordingRef.current) {
      stopVoice()
      return
    }
    const Ctor = speechCtor()
    if (!Ctor) {
      setVoiceNote(UNSUPPORTED_HINT)
      setOpen(true)
      return
    }
    const id = ++session.current
    endReason.current = null
    cancelPendingSpeech()
    draftRef.current = text
    transcriptRef.current = ''
    setLiveTranscript('')
    setVoiceNote(null)
    setElapsed(0)
    setRecordingState(true)
    const recognition = new Ctor()
    recognition.lang = 'ru-RU'
    recognition.continuous = true
    recognition.interimResults = true
    const started = Date.now()
    timers.current.tick = window.setInterval(() => {
      if (session.current !== id) return
      setElapsed(Math.min(20, Math.floor((Date.now() - started) / 1000)))
    }, 250)
    timers.current.limit = window.setTimeout(() => {
      if (session.current !== id) return
      try {
        recognition.stop()
      } catch {
        /* таймер сработал после остановки */
      }
    }, VOICE_MS)
    recognition.onresult = (event) => {
      if (session.current !== id) return
      let next = ''
      for (let i = 0; i < event.results.length; i++) next += event.results[i][0].transcript
      transcriptRef.current = next
      setLiveTranscript(next)
      setText(next)
    }
    recognition.onerror = (event) => {
      if (session.current !== id) return
      const code = event.error ?? ''
      if (code === 'no-speech' || code === 'aborted' || code === '') return
      const denied = code === 'not-allowed' || code === 'service-not-allowed'
      endReason.current = denied ? 'denied' : 'error'
      setVoiceNote(denied ? DENIED_HINT : RECOGNITION_HINT)
      setOpen(true)
      session.current += 1
      clearVoiceTimers()
      setRecordingState(false)
      setLiveTranscript('')
      speechRef.current = null
      if (!transcriptRef.current.trim()) setText(draftRef.current)
      try {
        recognition.abort()
      } catch {
        /* браузер уже закрыл сессию */
      }
    }
    recognition.onend = () => {
      if (session.current !== id) return
      clearVoiceTimers()
      setRecordingState(false)
      setLiveTranscript('')
      speechRef.current = null
      const spoken = transcriptRef.current.trim()
      const reason = endReason.current
      endReason.current = null
      if (reason === 'denied' || reason === 'error') {
        if (!spoken) setText(draftRef.current)
        setOpen(true)
        return
      }
      if (!spoken) {
        setText(draftRef.current)
        setVoiceNote(EMPTY_HINT)
        setOpen(true)
        return
      }
      setVoiceNote(null)
      setOpen(true)
      void sendText(spoken)
    }
    speechRef.current = recognition
    try {
      recognition.start()
    } catch {
      if (session.current !== id) return
      session.current += 1
      clearVoiceTimers()
      speechRef.current = null
      setRecordingState(false)
      setLiveTranscript('')
      setText(draftRef.current)
      setVoiceNote(UNSUPPORTED_HINT)
      setOpen(true)
    }
  }

  function cancelPendingSpeech() {
    const pending = speechRef.current
    speechRef.current = null
    if (!pending) return
    try {
      pending.abort()
    } catch {
      /* уже остановлено */
    }
  }

  function onMicClick() {
    if (recordingRef.current) stopVoice()
    else startVoice()
  }

  const heard = liveTranscript.trim()

  const recordingBox = recording ? (
          <div
            role="status"
            aria-live="polite"
            className={clsx('rounded-[16px] border border-danger/50 bg-panel p-4', embedded ? 'mx-3 mb-2' : 'w-[min(100vw-2rem,22rem)]')}
          >
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-danger/50 motion-reduce:animate-none" aria-hidden />
                <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-danger text-white">
                  <Mic className="h-4 w-4" aria-hidden />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-danger">Идёт запись</p>
                <p className="tabular text-sm text-text">
                  {clock(elapsed)}
                  <span className="text-muted"> / 0:20</span>
                </p>
              </div>
              <button
                type="button"
                className="inline-flex min-h-11 items-center rounded-[9px] px-3 text-sm font-medium text-text hover:bg-panel-2"
                onClick={discardVoice}
              >
                Отменить
              </button>
            </div>
            <p className="mt-3 max-h-24 overflow-y-auto whitespace-pre-wrap break-words text-sm">
              {heard ? heard : <span className="text-muted">Слушаю…</span>}
            </p>
            <p className="mt-2 text-xs text-muted">Ещё раз микрофон — отправить. Esc — отменить.</p>
          </div>
  ) : null

  return (
    <>
      {open ? (
        <section
          id={panelId}
          role={embedded ? 'region' : 'dialog'}
          aria-label="Чат с Grok Bot"
          className={clsx(
            'flex flex-col overflow-hidden rounded-[16px] border border-border bg-panel shadow-none',
            embedded
              ? 'h-[calc(100dvh-15rem-var(--safe-bottom))] min-h-[22rem] w-full md:h-[calc(100dvh-8.5rem)]'
              : 'fixed z-[60] right-4 bottom-[calc(8.5rem+var(--safe-bottom))] w-[min(100vw-2rem,24rem)] md:bottom-20',
          )}
          style={embedded ? undefined : { height: 'min(32rem, calc(100dvh - 9rem))' }}
        >
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Grok Bot</h2>
              <p className="text-xs text-muted">Сообщение уходит боту и сохраняется в CRM</p>
            </div>
            {embedded ? null : <Button
              type="button"
              variant="ghost"
              className="h-11 w-11 px-0"
              aria-label="Закрыть чат"
              onClick={() => {
                setOpen(false)
                buttonRef.current?.focus()
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </Button>}
          </header>
          <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" aria-live="polite">
            {loading && items.length === 0 ? <p className="text-sm text-muted">Загрузка…</p> : null}
            {!loading && items.length === 0 ? (
              <p className="text-sm text-muted">Напишите боту. Ответ появится в этом чате.</p>
            ) : null}
            {items.map((item) => {
              const note = deliveryLabel(item)
              const mine = item.role === 'user'
              return (
                <div key={item.id} className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div className={clsx('max-w-[85%] rounded-[12px] px-3 py-2 text-sm', mine ? 'bg-accent text-white' : 'bg-panel-2 text-text')}>
                    <p className="whitespace-pre-wrap break-words">{item.text}</p>
                    {note ? <p className={clsx('mt-1 text-xs', mine ? 'text-white/80' : 'text-muted')}>{note}</p> : null}
                  </div>
                </div>
              )
            })}
          </div>
          {error ? (
            <p className="px-4 pb-1 text-sm text-danger" role="alert">
              {error}{' '}
              <button type="button" className="underline" onClick={() => void load(true).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Не удалось открыть чат'))}>
                Повторить
              </button>
            </p>
          ) : null}
          {voiceNote ? (
            <p className="px-4 pb-1 text-xs text-muted" role="status">
              {voiceNote}
            </p>
          ) : null}
          {embedded ? recordingBox : null}
          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (recordingRef.current) {
                stopVoice()
                return
              }
              void sendText(text)
            }}
          >
            <label className="min-w-0 flex-1 text-sm">
              <span className="sr-only">Сообщение</span>
              <textarea
                ref={inputRef}
                value={text}
                rows={2}
                maxLength={4000}
                placeholder="Сообщение"
                className="max-h-28 min-h-11 w-full resize-none rounded-[9px] border border-border bg-bg px-3 py-2 text-base text-text placeholder:text-muted md:text-sm"
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    if (recordingRef.current) stopVoice()
                    else void sendText(text)
                  }
                }}
              />
            </label>
            <Button
              type="button"
              variant={recording ? 'danger' : 'outline'}
              className="h-11 w-11 shrink-0 px-0"
              aria-pressed={recording}
              aria-label={recording ? 'Остановить запись и отправить' : 'Голосовой ввод'}
              onClick={onMicClick}
            >
              <Mic className="h-4 w-4" aria-hidden />
            </Button>
            <Button type="submit" className="h-11 w-11 shrink-0 px-0" aria-label="Отправить" disabled={sending || (!recording && text.trim() === '')}>
              <Send className="h-4 w-4" aria-hidden />
            </Button>
          </form>
        </section>
      ) : null}
      {embedded ? null : <div className="fixed z-[70] right-4 bottom-[calc(4.75rem+var(--safe-bottom))] flex flex-col items-end gap-3 md:bottom-6">
        {recordingBox}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={clsx(
              'inline-flex h-12 items-center gap-1.5 rounded-full border bg-panel px-3 text-sm font-medium',
              open ? 'border-accent text-accent' : 'border-border text-text',
            )}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Скрыть чат' : 'Открыть чат'}
            onClick={() => setOpen((value) => !value)}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Чат
          </button>
          <button
            ref={buttonRef}
            type="button"
            className={clsx(
              'relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white',
              recording ? 'bg-danger' : 'bg-accent',
            )}
            aria-pressed={recording}
            aria-label={recording ? `Остановить запись и отправить, ${elapsed} из 20 секунд` : 'Начать голосовую запись'}
            onClick={onMicClick}
          >
            {recording ? (
              <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-danger/70 motion-reduce:animate-none" aria-hidden />
            ) : null}
            <Mic className="relative h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>}
    </>
  )
}
