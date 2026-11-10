import clsx from 'clsx'
import { Ellipsis, Globe, Phone, Store, Users } from 'lucide-react'
import type { ReactNode } from 'react'

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

function Brand({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden {...STROKE}>
      {children}
    </svg>
  )
}

export function SourceIcon({ source, className = 'h-4 w-4' }: { source: string; className?: string }) {
  const cls = clsx('shrink-0', className)
  switch (source) {
    case 'whatsapp':
      return (
        <Brand className={clsx(cls, 'text-[#25D366]')}>
          <path d="M3.5 20.5 4.9 16.4A8.5 8.5 0 1 1 8 19.3Z" />
          <path d="M9 8.6c.2-.5.6-.6.9-.6h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c.6 1.2 1.6 2.1 2.8 2.7l.6-.6c.2-.2.4-.2.6-.1l1.5.7c.2.1.4.3.4.5v.4c0 .4-.2.8-.6 1-1 .6-2.6.4-4.4-.9-1.8-1.3-3-3.2-3-4.6 0-.6.1-1.2.3-1.6Z" fill="currentColor" stroke="none" />
        </Brand>
      )
    case 'instagram':
      return (
        <Brand className={clsx(cls, 'text-[#E4405F]')}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
        </Brand>
      )
    case 'telegram':
      return (
        <Brand className={clsx(cls, 'text-[#229ED9]')}>
          <path d="M21 4 3 11l6.5 2.5L12 20l3.5-4.5 4.5 3.5Z" />
          <path d="m9.5 13.5 7-5.5" />
        </Brand>
      )
    case 'call':
      return <Phone className={clsx(cls, 'text-info')} aria-hidden />
    case 'site':
      return <Globe className={clsx(cls, 'text-dept-it')} aria-hidden />
    case 'offline':
      return <Store className={clsx(cls, 'text-warning')} aria-hidden />
    case 'referral':
      return <Users className={clsx(cls, 'text-dept-marketing')} aria-hidden />
    default:
      return <Ellipsis className={clsx(cls, 'text-muted')} aria-hidden />
  }
}
