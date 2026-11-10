import clsx from 'clsx'
import { X } from 'lucide-react'
import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type AnimationEvent,
  type ReactElement,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'outline' | 'danger'
}) {
  return (
    <button
      className={clsx(
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-[9px] px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-accent text-white hover:brightness-110',
        variant === 'ghost' && 'bg-transparent text-text hover:bg-panel-2',
        variant === 'outline' && 'border border-border bg-panel text-text hover:bg-panel-2',
        variant === 'danger' && 'bg-danger-strong text-white hover:bg-danger-hover active:brightness-95',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'min-h-11 w-full rounded-[9px] border border-border bg-bg px-3 text-base md:text-sm text-text placeholder:text-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Select } from './Select'

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={clsx(
        'min-h-24 w-full rounded-[9px] border border-border bg-bg p-3 text-base md:text-sm text-text placeholder:text-muted disabled:opacity-60',
        className,
      )}
      {...props}
    />
  )
}

export function Field({ label, children, className }: { label: string; children: ReactElement<{ id?: string }>; className?: string }) {
  const generated = useId()
  const id = children.props.id || generated
  return (
    <div className={clsx('flex min-w-0 flex-col gap-1 text-xs text-muted', className)}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={clsx('rounded-[14px] border border-border bg-panel', className)}>{children}</div>
  )
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'muted' | 'accent' | 'danger' | 'warning' | 'success' | 'info'
}) {
  const tones = {
    muted: 'border-border text-muted',
    accent: 'border-accent text-accent',
    danger: 'border-danger text-danger',
    warning: 'border-warning text-warning',
    success: 'border-success text-success',
    info: 'border-info text-info',
  }
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  )
}

export function Spinner({ label = 'Загрузка…' }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-muted" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-text">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 px-6 text-center" role="alert">
      <p className="text-sm text-danger">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  )
}

const modalStack: Array<{ current: () => void }> = []

function useModal(open: boolean, onClose: () => void, closeOnEscape = true) {
  const closeRef = useRef(onClose)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const entry = closeRef
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    modalStack.push(entry)
    document.body.classList.add('modal-open')
    const panel = panelRef.current
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true })

    const onKey = (e: KeyboardEvent) => {
      if (!closeOnEscape) return
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === entry) entry.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const index = modalStack.lastIndexOf(entry)
      if (index >= 0) modalStack.splice(index, 1)
      if (modalStack.length === 0) document.body.classList.remove('modal-open')
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [open, closeOnEscape])

  return panelRef
}

function usePresence(open: boolean, children: ReactNode) {
  const [mounted, setMounted] = useState(open)
  const [content, setContent] = useState<ReactNode>(open ? children : null)
  if (open && !mounted) setMounted(true)
  if (open && content !== children) setContent(children)
  const closing = mounted && !open

  const onAnimationEnd = (e: AnimationEvent) => {
    if (closing && e.target === e.currentTarget) {
      setMounted(false)
      setContent(null)
    }
  }

  return { mounted, closing, content: open ? children : content, onAnimationEnd }
}

function ModalHeader({ title, onClose, className }: { title: string; onClose: () => void; className?: string }) {
  return (
    <div className={clsx('sticky top-0 z-10 flex items-center justify-between gap-3 bg-panel', className)}>
      <h2 className="min-w-0 truncate text-lg font-semibold">{title}</h2>
      <Button variant="ghost" className="shrink-0 px-0" onClick={onClose} aria-label="Закрыть">
        <X className="h-5 w-5" aria-hidden />
      </Button>
    </div>
  )
}

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  persistent = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Filled forms stay open: only the X button (and an explicit Cancel in the form) closes them. */
  persistent?: boolean
}) {
  const panelRef = useModal(open, onClose, !persistent)
  const { mounted, closing, content, onAnimationEnd } = usePresence(open, children)
  if (!mounted) return null
  return (
    <div
      className={clsx('fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4', closing && 'pointer-events-none')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={closing || undefined}
    >
      {persistent ? (
        <div className="modal-backdrop absolute inset-0 bg-black/60" data-closing={closing || undefined} />
      ) : (
        <button className="modal-backdrop absolute inset-0 bg-black/60" data-closing={closing || undefined} aria-label="Закрыть" onClick={onClose} />
      )}
      <div
        ref={panelRef}
        tabIndex={-1}
        data-closing={closing || undefined}
        onAnimationEnd={onAnimationEnd}
        className="sheet-panel relative z-10 max-h-[90dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[16px] border border-border bg-panel px-5 pb-[calc(1.25rem+var(--safe-bottom))] outline-none sm:rounded-[16px] sm:pb-5"
      >
        <div className="sticky top-0 z-10 -mx-5 bg-panel px-5 pt-2 sm:pt-5">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden />
          <ModalHeader title={title} onClose={onClose} className="mb-3" />
        </div>
        {content}
      </div>
    </div>
  )
}

export function Drawer({
  open,
  title,
  onClose,
  children,
  wide = false,
  persistent = false,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** Filled forms stay open: only the X button closes them. */
  persistent?: boolean
}) {
  const panelRef = useModal(open, onClose, !persistent)
  const { mounted, closing, content, onAnimationEnd } = usePresence(open, children)
  if (!mounted) return null
  return (
    <div
      className={clsx('fixed inset-0 z-[70] flex justify-end', closing && 'pointer-events-none')}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-hidden={closing || undefined}
    >
      {persistent ? (
        <div className="modal-backdrop absolute inset-0 bg-black/50" data-closing={closing || undefined} />
      ) : (
        <button className="modal-backdrop absolute inset-0 bg-black/50" data-closing={closing || undefined} aria-label="Закрыть" onClick={onClose} />
      )}
      <div
        ref={panelRef}
        tabIndex={-1}
        data-closing={closing || undefined}
        onAnimationEnd={onAnimationEnd}
        className={clsx(
          'drawer-panel relative z-10 h-full w-full overflow-y-auto overflow-x-hidden overscroll-contain border-l border-border bg-panel px-4 pb-[calc(1.25rem+var(--safe-bottom))] outline-none sm:px-5',
          wide ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <ModalHeader
          title={title}
          onClose={onClose}
          className="-mx-4 mb-3 border-b border-border px-4 pt-[calc(0.75rem+var(--safe-top))] pb-2 sm:-mx-5 sm:px-5 sm:pt-4"
        />
        {content}
      </div>
    </div>
  )
}

export function SkeletonRows() {
  return (
    <div className="grid gap-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-12 rounded-[10px]" />
      ))}
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      className="fixed bottom-[calc(5rem+var(--safe-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-[10px] border border-border bg-panel-2 px-4 py-2 text-sm shadow-lg md:bottom-6"
      role="status"
    >
      {message}
    </div>
  )
}
