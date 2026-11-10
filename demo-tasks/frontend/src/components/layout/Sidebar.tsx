import clsx from 'clsx'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { taskCountLabel, useUnreadMentionCount, useUnseenTaskCount } from '../../lib/unseenTasks'
import { MQ_LG, useMediaQuery } from '../../lib/useMediaQuery'
import { useNavItems } from '../../lib/sidebarNav'

const STORAGE_KEY = 'demo.sidebar.collapsed'

type Indicator = { top: number; height: number }

// Sidebar remounts with every page, so the last position survives here to animate from it.
let lastIndicator: Indicator | null = null

export function TaskCountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span
      className={clsx(
        'tabular inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-white',
        className,
      )}
      aria-label={`новых задач: ${count}`}
    >
      {taskCountLabel(count)}
    </span>
  )
}

export function Sidebar() {
  const { can } = useAuth()
  const items = useNavItems(can)
  const unseen = useUnseenTaskCount() + useUnreadMentionCount()
  const wide = useMediaQuery(MQ_LG)
  const [preferCollapsed, setPreferCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const collapsed = !wide || preferCollapsed

  const toggle = () => {
    setPreferCollapsed((prev) => {
      localStorage.setItem(STORAGE_KEY, prev ? '0' : '1')
      return !prev
    })
  }

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(lastIndicator)
  const [animate, setAnimate] = useState(false)
  const { pathname } = useLocation()
  const activeKey = items.find((i) => pathname === i.to || pathname.startsWith(i.to + '/'))?.key

  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const link = nav.querySelector<HTMLElement>('a[aria-current="page"]')
      const next = link ? { top: link.offsetTop, height: link.offsetHeight } : null
      lastIndicator = next
      setIndicator(next)
    }
    const frame = requestAnimationFrame(() => {
      setAnimate(true)
      measure()
    })
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [pathname])

  return (
    <aside
      className={clsx(
        'sidebar sticky top-0 hidden h-dvh shrink-0 flex-col self-start overflow-y-auto overflow-x-hidden border-r border-border bg-bg py-4 md:flex',
        collapsed ? 'w-[72px]' : 'w-[220px]',
      )}
      data-collapsed={collapsed || undefined}
    >
      <div className="mb-8 flex min-h-9 items-center gap-3 px-[18px]">
        {wide ? (
          <button
            type="button"
            onClick={toggle}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] text-muted transition-colors hover:bg-panel hover:text-text"
            aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
          >
            <ToggleIcon className="h-5 w-5" aria-hidden />
          </button>
        ) : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
          </span>
        )}
        <span className="sidebar-fade flex items-center gap-2 whitespace-nowrap" aria-hidden={collapsed}>
          <span className="text-xl font-bold tracking-tight text-text">DEMO</span>
          <span className="mb-3 h-2.5 w-2.5 rounded-[2px] bg-accent" />
        </span>
      </div>
      <nav ref={navRef} className="relative flex flex-1 flex-col gap-1 px-2" aria-label="Основное меню">
        <span
          aria-hidden
          className={clsx('pointer-events-none absolute inset-x-2 top-0 rounded-[10px] nav-pill-c transition-[background-color] duration-300', activeKey && `nav-c-${activeKey}`, animate && 'nav-indicator', !indicator && 'opacity-0')}
          style={indicator ? { height: indicator.height, transform: `translateY(${indicator.top}px)` } : undefined}
        >
          <span className="absolute top-1/2 left-0 h-6 w-0.5 -translate-y-1/2 rounded-r nav-bar-c" />
        </span>
        {items
          .map((item) => {
            const Icon = item.icon
            const badge = item.to === '/tasks' ? unseen : 0
            const title = collapsed ? (badge > 0 ? `${item.label}, новых: ${badge}` : item.label) : undefined
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={title}
                className={({ isActive }) =>
                  clsx(
                    'relative flex min-h-11 items-center gap-3 whitespace-nowrap rounded-[10px] px-[18px] text-sm transition-colors duration-300',
                    `nav-c-${item.key}`,
                    isActive ? 'nav-active-c font-medium' : 'nav-hover-c text-muted hover:bg-panel/60 hover:text-text',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className={clsx('nav-icon h-5 w-5 shrink-0 transition-colors duration-300', isActive && 'nav-active-c')} aria-hidden />
                    {collapsed ? <TaskCountBadge count={badge} className="absolute top-1 right-1.5" /> : null}
                    <span className="sidebar-fade flex min-w-0 flex-1 items-center justify-between gap-2">
                      <span>{item.label}</span>
                      {collapsed ? null : <TaskCountBadge count={badge} />}
                    </span>
                  </>
                )}
              </NavLink>
            )
          })}
      </nav>
    </aside>
  )
}
