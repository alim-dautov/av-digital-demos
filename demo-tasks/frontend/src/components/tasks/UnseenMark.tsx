export function UnseenMark({ unseen }: { unseen?: boolean }) {
  if (!unseen) return null
  return (
    <span
      className="inline-block h-2 w-2 shrink-0 rounded-full bg-accent"
      title="Не открыта"
      aria-label="Не открыта"
    />
  )
}

/** Unread @mention of the viewer: a small "@" pill next to the title. */
export function MentionMark({ count }: { count?: number }) {
  if (!count) return null
  const label = count === 1 ? 'Вас упомянули в комментарии' : `Вас упомянули: ${count}`
  return (
    <span
      className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1 text-[11px] leading-none font-semibold text-white"
      title={label}
      aria-label={label}
    >
      @{count > 1 ? count : ''}
    </span>
  )
}

/** Subtle tint for a task with an unread @mention (not applied to urgent red cards). */
export const MENTION_HIGHLIGHT = 'border-accent/70 bg-accent/10'
