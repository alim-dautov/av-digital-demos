import clsx from 'clsx'
import { prepareUrgentAlerts } from '../../lib/urgentNotice'

export function UrgentBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center rounded-[6px] bg-white px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#991b1b]',
        className,
      )}
    >
      СРОЧНО
    </span>
  )
}

export function UrgentToggle({
  value,
  disabled,
  onChange,
}: {
  value: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-pressed={value}
      disabled={disabled}
      className={clsx(
        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] border-2 px-4 text-sm font-bold tracking-wide transition-colors sm:w-auto',
        value
          ? 'border-[#7f1d1d] bg-[#dc2626] text-white shadow-[0_0_0_3px_rgba(220,38,38,0.25)]'
          : 'border-[#dc2626] bg-[#dc2626]/10 text-[#dc2626] hover:bg-[#dc2626]/20',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      onClick={() => {
        const next = !value
        if (next) void prepareUrgentAlerts()
        onChange(next)
      }}
    >
      СРОЧНО
    </button>
  )
}
