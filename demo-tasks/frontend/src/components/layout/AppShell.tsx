import { PushPrompt } from '../pwa/PushPrompt'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { isRealOwner, useAuth } from '../../lib/auth'
import { bindOutboxOnline, pendingCount } from '../../lib/outbox'
import { MiniChat } from '../mini-chat/MiniChat'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

type Props = {
  title: string
  subtitle?: string
  showFilters?: boolean
  toolbar?: ReactNode
  onCreateTask?: () => void
  children: ReactNode
}

export function AppShell({ title, subtitle, showFilters, toolbar, onCreateTask, children }: Props) {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    bindOutboxOnline()
    const tick = async () => setPending(await pendingCount())
    void tick()
    const id = window.setInterval(() => void tick(), 5000)
    return () => window.clearInterval(id)
  }, [])

  return (
    <div className="app-scroll flex bg-bg">
      <Sidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col pb-28 md:pb-0">
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-accent px-4 py-1.5 text-center text-xs text-white">
          <span>Это демо-версия с вымышленными данными. Данные сбрасываются каждую ночь.</span>
          <a href="https://av-digital.kz/#contact" className="font-semibold underline">Хотите такую же систему?</a>
        </div>
        <Header
          title={title}
          subtitle={subtitle}
          showFilters={showFilters}
          toolbar={toolbar}
          onCreateTask={onCreateTask}
        />
        {user?.must_change_password && pathname !== '/settings' ? (
          <Link to="/settings" className="border-b border-border bg-accent-soft px-4 py-2 text-xs text-accent hover:underline md:px-6">
            Вы вошли с временным паролем — смените его в настройках
          </Link>
        ) : null}
        {pending > 0 ? (
          <div className="border-b border-border bg-accent-soft px-4 py-2 text-xs text-accent md:px-6">
            Ожидает отправки: {pending}
          </div>
        ) : null}
        <PushPrompt />
        <main className="page-reveal min-w-0 flex-1 overflow-x-clip px-4 py-4 md:px-6">{children}</main>
      </div>
      <MobileNav />
      {isRealOwner(user) && pathname !== '/agent' ? <MiniChat /> : null}
    </div>
  )
}
