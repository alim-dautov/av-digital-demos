import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { PwaInstallBanner, PwaUpdateToast } from './components/pwa/PwaPrompts'
import { Spinner } from './components/ui'
import { isRealOwner, useAuth } from './lib/auth'
import { homePath } from './lib/modules'

const loginReady = import('./pages/LoginPage')
const LoginPage = lazy(() => loginReady.then((m) => ({ default: m.LoginPage })))
const GrokBotPage = lazy(() => import('./pages/GrokBotPage').then((m) => ({ default: m.GrokBotPage })))
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })))
const SalesPage = lazy(() => import('./pages/SalesPage').then((m) => ({ default: m.SalesPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })))
const TasksPage = lazy(() => import('./pages/TasksPage').then((m) => ({ default: m.TasksPage })))
const TeamPage = lazy(() => import('./pages/TeamPage').then((m) => ({ default: m.TeamPage })))
const KpPage = lazy(() => import('./pages/KpPage').then((m) => ({ default: m.KpPage })))
const KpiPage = lazy(() => import('./pages/KpiPage').then((m) => ({ default: m.KpiPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((m) => ({ default: m.AnalyticsPage })))
const WhatsappPage = lazy(() => import('./pages/WhatsappPage').then((m) => ({ default: m.WhatsappPage })))
const AttendancePage = lazy(() => import('./pages/AttendancePage').then((m) => ({ default: m.AttendancePage })))
const AttendanceDisplayPage = lazy(() => import('./pages/AttendanceDisplayPage').then((m) => ({ default: m.AttendanceDisplayPage })))
const WarehousePage = lazy(() => import('./pages/WarehousePage').then((m) => ({ default: m.WarehousePage })))

function PageFallback() {
  return (
    <div className="safe-screen flex min-h-[100dvh] items-center justify-center bg-bg">
      <Spinner />
    </div>
  )
}

function Gate({ module, children }: { module?: string; children: ReactNode }) {
  const { user, modules, loading } = useAuth()
  if (loading) return <PageFallback />
  if (!user) return <Navigate to="/login" replace />
  if (module === 'owner_only' && !isRealOwner(user)) {
    return <Navigate to={homePath(modules, user.role === 'owner')} replace />
  }
  if (module && module !== 'owner_only' && user.role !== 'owner' && !modules.includes(module)) {
    return <Navigate to={homePath(modules, false)} replace />
  }
  return <>{children}</>
}

function Home() {
  const { user, modules, loading } = useAuth()
  if (loading) return <PageFallback />
  if (!user) return <Navigate to="/login" replace />
  return <Navigate to={homePath(modules, user.role === 'owner')} replace />
}

const DISPLAY_ROLE = 'attendance_display'

export default function App() {
  const { user } = useAuth()
  // QR-screen account: no CRM, no sidebar — only the QR on any path.
  if (user?.role === DISPLAY_ROLE) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AttendanceDisplayPage />
      </Suspense>
    )
  }
  return (
    <>
      <PwaInstallBanner />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Gate module="dashboard"><OverviewPage /></Gate>} />
          <Route path="/tasks" element={<Gate module="tasks"><TasksPage /></Gate>} />
          <Route path="/sales" element={<Gate module="sales"><SalesPage /></Gate>} />
          <Route path="/team" element={<Gate module="team_admin"><TeamPage /></Gate>} />
          <Route path="/team/:id" element={<Gate module="team_admin"><TeamPage /></Gate>} />
          <Route path="/kp" element={<Gate module="kp"><KpPage /></Gate>} />
          <Route path="/kpi" element={<Gate module="kpi"><KpiPage /></Gate>} />
          <Route path="/analytics" element={<Gate module="analytics"><AnalyticsPage /></Gate>} />
          <Route path="/whatsapp" element={<Gate module="whatsapp"><WhatsappPage /></Gate>} />
          <Route path="/warehouse" element={<Gate module="warehouse"><WarehousePage /></Gate>} />
          <Route path="/attendance" element={<Gate module="attendance"><AttendancePage /></Gate>} />
          <Route path="/reports" element={<Gate module="reports"><ReportsPage /></Gate>} />
          <Route path="/agent" element={<Gate module="owner_only"><GrokBotPage /></Gate>} />
          <Route path="/bot" element={<Navigate to="/" replace />} />
          <Route path="/settings" element={<Gate><SettingsPage /></Gate>} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      <PwaUpdateToast />
    </>
  )
}
