import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, setCsrf } from './api'
import { detachPushSubscription, syncPushSubscription } from './push'

export type User = {
  id: number
  email: string
  username: string | null
  name: string
  initials: string
  phone: string | null
  must_change_password: boolean
  role: string
  role_name: string
  department_id: number | null
  see_all_tasks: boolean
  totp_enabled: boolean
  is_superadmin?: boolean
}

import { isRealOwner } from './roles'
export { isCrmAdmin, isRealOwner } from './roles'

type AuthState = {
  user: User | null
  modules: string[]
  permissions: string[]
  loading: boolean
  error: string | null
  login: (login: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  can: (resource: string, action?: string) => boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [modules, setModules] = useState<string[]>([])
  const [permissions, setPermissions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await api<{
        user: User
        modules: string[]
        permissions: string[]
        csrf_token: string
      }>('/me')
      setUser(data.user)
      setModules(data.modules)
      setPermissions(data.permissions)
      setCsrf(data.csrf_token)
      setError(null)
    } catch {
      setUser(null)
      setModules([])
      setPermissions([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const userId = user?.id
  useEffect(() => {
    if (userId) void syncPushSubscription().catch(() => undefined)
  }, [userId])

  const login = useCallback(async (loginName: string, password: string) => {
    const data = await api<{
      user: User
      csrf_token: string
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login: loginName, password }),
    })
    setCsrf(data.csrf_token)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await detachPushSubscription().catch(() => undefined)
      await api('/auth/logout', { method: 'POST', body: '{}' })
    } finally {
      setUser(null)
      setModules([])
      setPermissions([])
      setCsrf('')
    }
  }, [])

  const can = useCallback(
    (resource: string, action = 'view') => {
      if (resource === 'owner_only') return isRealOwner(user)
      if (user?.role === 'owner') return true
      return permissions.includes(`${resource}:${action}`)
    },
    [permissions, user],
  )

  const value = useMemo(
    () => ({ user, modules, permissions, loading, error, login, logout, refresh, can }),
    [user, modules, permissions, loading, error, login, logout, refresh, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside provider')
  return ctx
}
