import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  isTransientApiError,
  type AuthPolicy,
  type AuthPrincipal,
  type MonitoringPluginKind,
} from '@/lib/api'
import {clearSessionCookie} from '@/lib/storage'
import {useServer} from './ServerProvider'

interface AuthContextValue {
  ready: boolean
  policy: AuthPolicy | null
  principal: AuthPrincipal | null
  reconnecting: boolean
  refresh: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  canAccessPlugin: (kind: MonitoringPluginKind, id: string) => boolean
  canWrite: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({children}: {children: ReactNode}) {
  const {serverUrl} = useServer()
  const [ready, setReady] = useState(false)
  const [policy, setPolicy] = useState<AuthPolicy | null>(null)
  const [principal, setPrincipal] = useState<AuthPrincipal | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  const refresh = useCallback(async () => {
    if (!serverUrl) {
      setPolicy(null)
      setPrincipal(null)
      setReady(true)
      return
    }

    try {
      const nextPolicy = await api.auth.policy()
      setPolicy(nextPolicy)
      if (!nextPolicy.auth_enabled) {
        setPrincipal({
          kind: 'anonymous',
          user: null,
          is_admin: true,
          can_write: true,
          plugins: 'all',
        })
        setReconnecting(false)
        setReady(true)
        return
      }
      try {
        const me = await api.auth.me()
        setPrincipal(me.principal)
      } catch (err) {
        if (isTransientApiError(err)) {
          setReconnecting(true)
          return
        }
        setPrincipal(null)
      }
      setReconnecting(false)
      setReady(true)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setPolicy(null)
      setPrincipal(null)
      setReady(true)
      setReconnecting(false)
    }
  }, [serverUrl])

  useEffect(() => {
    setReady(false)
    void refresh()
  }, [refresh])

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.auth.login(username, password)
    setPrincipal(me.principal)
    const nextPolicy = await api.auth.policy()
    setPolicy(nextPolicy)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } catch {
      // clear local session even if server unreachable
    }
    await clearSessionCookie()
    setPrincipal(null)
    await refresh()
  }, [refresh])

  const canAccessPlugin = useCallback(
    (kind: MonitoringPluginKind, id: string) => {
      if (!policy?.login_required && !principal) return true
      if (!principal) return false
      if (principal.plugins === 'all') return true
      return principal.plugins.some(p => p.kind === kind && p.id === id)
    },
    [principal, policy],
  )

  const canWrite =
    Boolean(principal?.can_write) ||
    Boolean(policy && !policy.auth_enabled)

  const value = useMemo(
    () => ({
      ready,
      policy,
      principal,
      reconnecting,
      refresh,
      login,
      logout,
      canAccessPlugin,
      canWrite,
    }),
    [
      ready,
      policy,
      principal,
      reconnecting,
      refresh,
      login,
      logout,
      canAccessPlugin,
      canWrite,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
