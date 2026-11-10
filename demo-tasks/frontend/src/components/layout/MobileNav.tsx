import clsx from 'clsx'
import { MoreHorizontal } from 'lucide-react'
import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useUnreadMentionCount, useUnseenTaskCount } from '../../lib/unseenTasks'
import { BottomSheet } from '../ui'
import { useNavItems } from '../../lib/sidebarNav'
import { TaskCountBadge } from './Sidebar'

export function MobileNav() {
  const { can } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const ordered = useNavItems(can)
  const primary = ordered.slice(0, 4)
  const more = ordered.slice(4)
  const { pathname } = useLocation()
  const unseen = useUnseenTaskCount() + useUnreadMentionCount()
  const moreItem = more.find((i) => pathname === i.to || pathname.startsWith(i.to + '/'))
  const moreActive = Boolean(moreItem)

  return (
    <>
      <nav
        className="bottom-nav fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-panel md:hidden"
        aria-label="Мобильная навигация"
      >
        {primary.slice(0, 4).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]',
                  `nav-c-${item.key}`,
                  isActive ? 'nav-active-c font-semibold' : 'text-muted',
                )
              }
            >
              {({ isActive }) => (<>
              {isActive ? <span className="nav-bar-c absolute top-0 h-0.5 w-8 rounded-b" aria-hidden /> : null}
              <span className={clsx('relative rounded-full px-3 py-0.5', isActive && 'nav-pill-c')}>
                <Icon className="h-5 w-5" aria-hidden />
                {item.to === '/tasks' ? <TaskCountBadge count={unseen} className="absolute -top-2 -right-3" /> : null}
              </span>
              {item.label}
              </>)}
            </NavLink>
          )
        })}
        <button
          type="button"
          className={clsx('relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', moreItem && `nav-c-${moreItem.key}`, moreActive ? 'nav-active-c font-semibold' : 'text-muted')}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          {moreActive ? <span className="nav-bar-c absolute top-0 h-0.5 w-8 rounded-b" aria-hidden /> : null}
          <span className={clsx('rounded-full px-3 py-0.5', moreActive && 'nav-pill-c')}>
            <MoreHorizontal className="h-5 w-5" aria-hidden />
          </span>
          Ещё
        </button>
      </nav>
      <BottomSheet open={moreOpen} title="Ещё" onClose={() => setMoreOpen(false)}>
        <div className="flex flex-col gap-1">
          {more.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  clsx(
                    'flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm',
                    `nav-c-${item.key}`,
                    isActive ? 'nav-pill-c nav-active-c font-medium' : 'nav-hover-c hover:bg-panel-2',
                  )
                }
                onClick={() => setMoreOpen(false)}
              >
                {({ isActive }) => (<>
                  <Icon className={clsx('nav-icon h-5 w-5', isActive ? 'nav-active-c' : 'text-muted')} aria-hidden />
                  {item.label}
                </>)}
              </NavLink>
            )
          })}
        </div>
      </BottomSheet>
    </>
  )
}
