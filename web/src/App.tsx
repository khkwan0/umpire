import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {NavLink, Navigate, Route, Routes} from 'react-router-dom'
import {useLocation} from 'react-router-dom'
import {
  api,
  isTransientApiError,
  type PluginCatalogEntry,
  type PluginManagerState,
} from './api'
import {useAuth} from './auth'
import ReconnectBanner from './ReconnectBanner'
import {assetUrl} from './basePath'
import {
  hasDashboardWidget,
  isPluginUiModule,
  type DashboardWidgetModule,
  type PluginUiModule,
} from './plugin-ui'
import {useRealtimeMode, useRealtimeRefresh} from './realtime'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Targets from './pages/Targets'
import SettingsPage from './pages/Settings'
import AgentPage from './pages/Agent'
import LoginPage from './pages/Login'
import HttpCheckTargetOverride from './pages/HttpCheckTargetOverride'
import NotifierTargetOverride from './pages/NotifierTargetOverride'
import {useOnboarding} from './onboarding'

const uiModules = Object.values(
  import.meta.glob('../../plugins/*/*/ui/index.tsx', {
    eager: true,
  }),
)
  .map(mod => {
    const m = mod as {default?: unknown}
    return m.default
  })
  .filter(isPluginUiModule)

function isLoaded(entry: PluginCatalogEntry, ui: PluginUiModule): boolean {
  return entry.kind === ui.kind && entry.id === ui.id
}

function NavDropdown({
  label,
  active,
  children,
  forceOpen = false,
  dataOnboarding,
}: {
  label: string
  active: boolean
  children: ReactNode
  forceOpen?: boolean
  dataOnboarding?: string
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const location = useLocation()

  const close = useCallback(() => {
    const el = detailsRef.current
    if (el) el.open = false
  }, [])

  useEffect(() => {
    if (forceOpen) return
    close()
  }, [close, forceOpen, location.pathname])

  useLayoutEffect(() => {
    const el = detailsRef.current
    if (forceOpen && el) el.open = true
  }, [forceOpen])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      const el = detailsRef.current
      if (!el || !el.open || el.contains(event.target as Node)) return
      if (forceOpen) return
      close()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && detailsRef.current?.open && !forceOpen) {
        close()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [close, forceOpen])

  return (
    <details
      ref={detailsRef}
      name="nav-dropdown"
      className={`nav-dropdown${active ? ' active' : ''}`}
      data-onboarding={dataOnboarding}
      onToggle={() => {
        if (forceOpen && detailsRef.current) detailsRef.current.open = true
      }}
    >
      <summary>{label}</summary>
      <div className="nav-dropdown-menu" onClick={close}>
        {children}
      </div>
    </details>
  )
}

export default function App() {
  const location = useLocation()
  const {
    ready: authReady,
    policy,
    principal,
    reconnecting: authReconnecting,
    logout,
    canAccessPlugin,
  } = useAuth()
  const [catalog, setCatalog] = useState<PluginCatalogEntry[] | null>(null)
  const [pluginManager, setPluginManager] = useState<PluginManagerState | null>(
    null,
  )
  const [reconnecting, setReconnecting] = useState(false)

  const load = useCallback(async () => {
    if (policy?.login_required && principal?.kind !== 'user') return
    try {
      const [nextCatalog, nextManager] = await Promise.all([
        api.plugins.list(),
        api.pluginManager.get(),
      ])
      setCatalog(nextCatalog)
      setPluginManager(nextManager)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setCatalog([])
      setReconnecting(false)
    }
  }, [policy?.login_required, principal])

  useEffect(() => {
    void load()
  }, [load])

  const onRealtimeRefresh = useCallback(() => {
    void load()
  }, [load])

  useRealtimeRefresh(onRealtimeRefresh)

  const realtimeMode = useRealtimeMode()

  const activeUi = useMemo(() => {
    if (!catalog) return []
    return uiModules.filter(ui => {
      if (!catalog.some(e => isLoaded(e, ui))) return false
      if (!canAccessPlugin(ui.kind, ui.id)) return false
      if (ui.kind === 'notify') {
        const notifier = pluginManager?.notifiers.find(n => n.id === ui.id)
        return notifier ? notifier.enabled : true
      }
      if (ui.kind === 'check') {
        const check = pluginManager?.checks.find(c => c.id === ui.id)
        return check ? check.enabled : true
      }
      return true
    })
  }, [catalog, pluginManager, canAccessPlugin])

  const dashboardWidgets = useMemo(() => {
    if (!catalog) return []
    const out: DashboardWidgetModule[] = []
    for (const entry of catalog) {
      const ui = uiModules.find(m => isLoaded(entry, m))
      if (!ui || !hasDashboardWidget(ui)) continue
      if (!canAccessPlugin(ui.kind, ui.id)) continue
      if (ui.kind === 'notify') {
        const notifier = pluginManager?.notifiers.find(n => n.id === ui.id)
        if (notifier && !notifier.enabled) continue
      }
      if (ui.kind === 'check') {
        const check = pluginManager?.checks.find(c => c.id === ui.id)
        if (check && !check.enabled) continue
      }
      out.push(ui)
    }
    return out
  }, [catalog, pluginManager, canAccessPlugin])

  const nonDropdownUi = useMemo(
    () => activeUi.filter(ui => ui.kind === 'scheduler'),
    [activeUi],
  )
  const checkUi = useMemo(
    () => activeUi.filter(ui => ui.kind === 'check'),
    [activeUi],
  )
  const notifierUi = useMemo(
    () => activeUi.filter(ui => ui.kind === 'notify'),
    [activeUi],
  )
  const checksMenuActive = checkUi.some(ui => ui.path === location.pathname)
  const notifierMenuActive = notifierUi.some(
    ui => ui.path === location.pathname,
  )
  const {forceNotifiersOpen} = useOnboarding()

  if (!authReady) {
    return (
      <div className="shell">
        <main>
          <p className="muted">Loading…</p>
        </main>
      </div>
    )
  }

  if (location.pathname === '/login') {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
      </Routes>
    )
  }

  if (policy?.login_required && principal?.kind !== 'user') {
    return <Navigate to="/login" replace state={{from: location.pathname}} />
  }

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img
            className="brand-logo"
            src={assetUrl('umpire_logo.svg')}
            alt="UMPIRE"
            width={128}
            height={128}
          />
          <div>
            <h1>UMPIRE</h1>
            <p>Universal Monitoring Plugin &amp; Incident Reporter</p>
          </div>
        </div>
        <div
          className={
            reconnecting || authReconnecting || realtimeMode === 'reconnecting'
              ? 'warn small'
              : realtimeMode === 'sse'
                ? 'ok-text small'
                : 'error small'
          }
        >
          {reconnecting || authReconnecting
            ? 'Reconnecting to API…'
            : realtimeMode === 'reconnecting'
              ? 'Realtime reconnecting…'
              : realtimeMode === 'sse'
                ? 'Realtime: SSE connected'
                : 'Realtime degraded: polling fallback active'}
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/targets" data-onboarding="targets-nav">
            Targets
          </NavLink>
          <NavLink to="/agent">Agent</NavLink>
          {nonDropdownUi.map(ui => (
            <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
              {ui.label}
            </NavLink>
          ))}
          <NavDropdown label="Checks" active={checksMenuActive}>
            {checkUi.length === 0 ? (
              <span className="muted small">No check pages</span>
            ) : (
              checkUi.map(ui => (
                <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
                  {ui.label}
                </NavLink>
              ))
            )}
          </NavDropdown>
          <NavDropdown
            label="Notifiers"
            active={notifierMenuActive}
            forceOpen={forceNotifiersOpen}
            dataOnboarding="notifiers-nav"
          >
            {notifierUi.length === 0 ? (
              <span className="muted small">No notifier pages</span>
            ) : (
              notifierUi.map(ui => (
                <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
                  {ui.label}
                </NavLink>
              ))
            )}
          </NavDropdown>
          <NavLink to="/settings">Settings</NavLink>
          {principal?.kind === 'user' ? (
            <button
              type="button"
              className="nav-text-button"
              onClick={() => void logout()}
            >
              Sign out ({principal.user?.username})
            </button>
          ) : policy?.auth_enabled ? (
            <NavLink to="/login">Sign in</NavLink>
          ) : null}
        </nav>
      </header>
      <main>
        {(reconnecting || authReconnecting) && <ReconnectBanner />}
        {!principal?.can_write && policy?.auth_enabled && (
          <p className="muted small read-only-banner">
            Read-only mode.{' '}
            {principal?.kind === 'user' ? (
              <>Mutations require write access.</>
            ) : (
              <>
                <NavLink to="/login">Sign in</NavLink> for write access.
              </>
            )}
          </p>
        )}
        <Routes>
          <Route path="/" element={<Dashboard widgets={dashboardWidgets} />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/targets" element={<Targets />} />
          {activeUi.some(ui => ui.kind === 'check' && ui.id === 'http') && (
            <Route
              path="/targets/:targetId/checks/http"
              element={<HttpCheckTargetOverride />}
            />
          )}
          <Route
            path="/targets/:targetId/notifiers/:notifierId"
            element={<NotifierTargetOverride />}
          />
          {activeUi.map(ui => (
            <Route
              key={`${ui.kind}:${ui.id}`}
              path={ui.path}
              element={<ui.Component />}
            />
          ))}
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/agent" element={<AgentPage />} />
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </main>
    </div>
  )
}
