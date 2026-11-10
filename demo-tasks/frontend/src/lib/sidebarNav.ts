import {
  BarChart3,
  CheckSquare,
  Clock,
  FileText,
  LineChart,
  Target,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Package,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { api } from './api'

export type NavItem = { key: string; to: string; label: string; icon: LucideIcon; resource: string }

/** Default order. Keys match Policy::navItems() on the server. «Команда» uses team_admin = owner only. */
export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', to: '/dashboard', label: 'Обзор', icon: LayoutDashboard, resource: 'dashboard' },
  { key: 'tasks', to: '/tasks', label: 'Задачи', icon: CheckSquare, resource: 'tasks' },
  { key: 'sales', to: '/sales', label: 'Продажи', icon: BarChart3, resource: 'sales' },
  { key: 'team', to: '/team', label: 'Команда', icon: Users, resource: 'team_admin' },
  { key: 'kp', to: '/kp', label: 'КП', icon: FileText, resource: 'kp' },
  { key: 'kpi', to: '/kpi', label: 'KPI', icon: Target, resource: 'kpi' },
  { key: 'attendance', to: '/attendance', label: 'Посещаемость', icon: Clock, resource: 'attendance' },
  { key: 'analytics', to: '/analytics', label: 'Аналитика', icon: LineChart, resource: 'analytics' },
  { key: 'warehouse', to: '/warehouse', label: 'Склад', icon: Package, resource: 'warehouse' },
  { key: 'reports', to: '/reports', label: 'Отчёты', icon: ClipboardList, resource: 'reports' },
  { key: 'agent', to: '/agent', label: 'Grok Bot', icon: Sparkles, resource: 'owner_only' },
  { key: 'whatsapp', to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, resource: 'whatsapp' },
  { key: 'settings', to: '/settings', label: 'Настройки', icon: Settings, resource: '' },
]

/** Saved keys first (unknown/duplicate ignored), then items missing from the saved list in default order. */
export function mergeOrder(saved: readonly string[] | null | undefined, items: NavItem[] = NAV_ITEMS): NavItem[] {
  const byKey = new Map(items.map((i) => [i.key, i]))
  const out: NavItem[] = []
  for (const key of saved ?? []) {
    const item = byKey.get(key)
    if (item && !out.includes(item)) out.push(item)
  }
  for (const item of items) if (!out.includes(item)) out.push(item)
  return out
}

let saved: string[] | null = null
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function load() {
  if (loaded) return
  loaded = true
  void api<{ sidebar_order?: string[] | null }>('/me/prefs')
    .then((p) => {
      saved = p.sidebar_order ?? null
      emit()
    })
    .catch(() => {
      loaded = false
    })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  load()
  return () => listeners.delete(listener)
}

export function useSidebarOrder(): string[] | null {
  return useSyncExternalStore(subscribe, () => saved)
}

export async function saveSidebarOrder(order: string[] | null): Promise<void> {
  const res = await api<{ sidebar_order?: string[] | null }>('/me/prefs', {
    method: 'PUT',
    body: JSON.stringify({ sidebar_order: order }),
  })
  saved = res.sidebar_order ?? null
  loaded = true
  emit()
}

/** Ordered items the user may open. */
export function useNavItems(can: (resource: string) => boolean): NavItem[] {
  const order = useSidebarOrder()
  return mergeOrder(order).filter((i) => !i.resource || can(i.resource))
}
