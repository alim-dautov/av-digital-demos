import clsx from 'clsx'
import { Check, ChevronDown } from 'lucide-react'
import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type Option = { value: string; label: string; disabled: boolean; group?: string }

type Props = {
  id?: string
  name?: string
  value?: string | number | null
  onChange?: (event: { target: { value: string } }) => unknown
  disabled?: boolean
  required?: boolean
  className?: string
  children?: ReactNode
  icon?: (value: string) => ReactNode
  'aria-label'?: string
}

type Position = { left: number; width: number; maxHeight: number; top?: number; bottom?: number }

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) return textOf((node.props as { children?: ReactNode }).children)
  return ''
}

function collect(children: ReactNode, group?: string, out: Option[] = []): Option[] {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    const props = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean; label?: string }
    if (child.type === 'option') {
      out.push({ value: String(props.value ?? textOf(props.children)), label: textOf(props.children), disabled: Boolean(props.disabled), group })
    } else if (child.type === 'optgroup') {
      collect(props.children, props.label, out)
    } else if (child.type === Fragment) {
      collect(props.children, group, out)
    }
  })
  return out
}

const GAP = 6
const EDGE = 8
const MAX_HEIGHT = 320

export function Select({ id, name, value, onChange, disabled, required, className, children, icon, 'aria-label': ariaLabel }: Props) {
  const options = useMemo(() => collect(children), [children])
  const current = value === null || value === undefined ? '' : String(value)
  const selectedIndex = options.findIndex((o) => o.value === current)
  const shown = options[selectedIndex >= 0 ? selectedIndex : 0]
  const autoWidth = /(^|\s)w-auto(\s|$)/.test(className || '')

  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState<Position | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const typed = useRef({ text: '', at: 0 })
  const listId = useId()

  const close = useCallback(() => {
    setOpen(false)
    setActive(-1)
  }, [])

  const place = useCallback(() => {
    const el = trigger.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.min(Math.max(r.width, 200), window.innerWidth - EDGE * 2)
    const left = Math.min(Math.max(r.left, EDGE), window.innerWidth - width - EDGE)
    const below = window.innerHeight - r.bottom - GAP - EDGE
    const above = r.top - GAP - EDGE
    const wanted = Math.min(MAX_HEIGHT, options.length * 44 + 8)
    if (below < wanted && above > below) {
      setPos({ left, width, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(MAX_HEIGHT, above) })
    } else {
      setPos({ left, width, top: r.bottom + GAP, maxHeight: Math.min(MAX_HEIGHT, below) })
    }
  }, [options.length])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!trigger.current?.contains(target) && !list.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  useEffect(() => {
    if (!open || active < 0) return
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [open, active, pos])

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) {
      if (!options[i].disabled) return i
    }
    return from
  }

  const show = () => {
    if (disabled || options.length === 0) return
    setActive(selectedIndex >= 0 ? selectedIndex : step(-1, 1))
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = options[index]
    if (!option || option.disabled) return
    close()
    trigger.current?.focus({ preventScroll: true })
    if (option.value !== current) onChange?.({ target: { value: option.value } })
  }

  const typeAhead = (key: string) => {
    const now = Date.now()
    typed.current = { text: now - typed.current.at < 600 ? typed.current.text + key.toLowerCase() : key.toLowerCase(), at: now }
    const start = open ? active : selectedIndex
    const order = [...options.keys()].map((i) => (i + start + 1) % options.length)
    const match = order.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(typed.current.text))
    if (match === undefined) return
    if (open) setActive(match)
    else if (options[match].value !== current) onChange?.({ target: { value: options[match].value } })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (!open) show()
        else setActive((i) => step(i, e.key === 'ArrowDown' ? 1 : -1))
        break
      case 'Home':
      case 'End':
        if (!open) return
        e.preventDefault()
        setActive(e.key === 'Home' ? step(-1, 1) : step(options.length, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (open && active >= 0) choose(active)
        else show()
        break
      case 'Escape':
        if (!open) return
        e.preventDefault()
        e.stopPropagation()
        close()
        break
      case 'Tab':
        if (open) close()
        break
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeAhead(e.key)
    }
  }

  return (
    <div className={clsx('relative min-w-0', !/(^|\s)w-/.test(className || '') && 'w-full', className)}>
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        data-value={current}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        onKeyUp={(e) => e.key === ' ' && e.preventDefault()}
        className={clsx(
          'flex min-h-11 w-full items-center gap-2 rounded-[9px] border bg-bg pr-2.5 pl-3 text-left text-base text-text transition-colors md:text-sm',
          open ? 'border-accent' : 'border-border hover:border-muted/50',
          'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border',
        )}
      >
        {icon && shown ? icon(shown.value) : null}
        {autoWidth ? (
          <span className="grid min-w-0 flex-1">
            {options.map((o, i) => (
              <span key={`${o.value}-${i}`} className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap" aria-hidden>
                {o.label}
              </span>
            ))}
            <span className="col-start-1 row-start-1 truncate">{shown?.label}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate">{shown?.label}</span>
        )}
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-muted transition-transform duration-200', open && 'rotate-180 text-accent')} aria-hidden />
      </button>
      {required || name ? (
        <input
          tabIndex={-1}
          aria-hidden
          name={name}
          required={required}
          value={current}
          onChange={() => undefined}
          onFocus={() => trigger.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        />
      ) : null}
      {open && pos
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="select-pop fixed z-[70] overflow-y-auto overscroll-contain rounded-[12px] border border-border bg-panel-2 p-1 shadow-2xl shadow-black/60"
              style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            >
              {options.map((o, i) => {
                const header = o.group && o.group !== options[i - 1]?.group
                const selected = i === selectedIndex
                return (
                  <Fragment key={`${o.value}-${i}`}>
                    {header ? (
                      <li role="presentation" className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                        {o.group}
                      </li>
                    ) : null}
                    <li
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={o.disabled || undefined}
                      onPointerDown={(e) => e.preventDefault()}
                      onPointerMove={() => !o.disabled && active !== i && setActive(i)}
                      onClick={() => choose(i)}
                      className={clsx(
                        'flex min-h-11 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-sm md:min-h-9',
                        i === active && 'bg-panel',
                        selected ? 'text-accent' : 'text-text',
                        o.disabled && 'cursor-not-allowed opacity-50',
                      )}
                    >
                      {icon ? icon(o.value) : null}
                      <span className="min-w-0 flex-1 break-words">{o.label}</span>
                      {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                    </li>
                  </Fragment>
                )
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  )
}
