// Grok Bot (/agent) is owner-only and is never granted per employee, so it is not listed here.
export const MODULES = [
  { id: 'dashboard', label: 'Обзор', path: '/dashboard' },
  { id: 'tasks', label: 'Задачи', path: '/tasks' },
  { id: 'sales', label: 'Продажи', path: '/sales' },
  { id: 'warehouse', label: 'Склад', path: '/warehouse' },
  { id: 'reports', label: 'Отчёты', path: '/reports' },
  { id: 'whatsapp', label: 'WhatsApp', path: '/whatsapp' },
  { id: 'kp', label: 'КП', path: '/kp' },
  { id: 'kpi', label: 'KPI', path: '/kpi' },
  { id: 'analytics', label: 'Аналитика', path: '/analytics' },
  { id: 'attendance', label: 'Посещаемость', path: '/attendance' },
] as const

export type ModuleId = (typeof MODULES)[number]['id']

export function homePath(modules: string[], isOwner: boolean): string {
  if (isOwner) return '/dashboard'
  const allowed = MODULES.filter((item) => modules.includes(item.id))
  if (allowed.length === 0) return '/settings'
  if (allowed.length === 1) return allowed[0].path
  if (allowed.some((item) => item.id === 'dashboard')) return '/dashboard'
  return allowed[0].path
}
