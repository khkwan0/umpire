import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useLocation } from 'react-router-dom'
import { api, type PluginCatalogEntry, type PluginManagerState } from './api'
import {
  hasDashboardWidget,
  isPluginUiModule,
  type DashboardWidgetModule,
  type PluginUiModule,
} from './plugin-ui'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Targets from './pages/Targets'
import SettingsPage from './pages/Settings'

const uiModules = Object.values(
  import.meta.glob('../../api/src/plugins/*/*/ui/index.tsx', {
    eager: true,
  }),
)
  .map((mod) => {
    const m = mod as { default?: unknown }
    return m.default
  })
  .filter(isPluginUiModule)

function isLoaded(entry: PluginCatalogEntry, ui: PluginUiModule): boolean {
  return entry.kind === ui.kind && entry.id === ui.id
}

export default function App() {
  const location = useLocation()
  const [catalog, setCatalog] = useState<PluginCatalogEntry[] | null>(null)
  const [pluginManager, setPluginManager] = useState<PluginManagerState | null>(
    null,
  )

  useEffect(() => {
    const load = async () => {
      try {
        const [nextCatalog, nextManager] = await Promise.all([
          api.plugins.list(),
          api.pluginManager.get(),
        ])
        setCatalog(nextCatalog)
        setPluginManager(nextManager)
      } catch {
        setCatalog([])
      }
    }

    void load()
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [])

  const activeUi = useMemo(() => {
    if (!catalog) return []
    return uiModules.filter((ui) => {
      if (!catalog.some((e) => isLoaded(e, ui))) return false
      if (ui.kind === 'notify') {
        const notifier = pluginManager?.notifiers.find((n) => n.id === ui.id)
        return notifier ? notifier.enabled : true
      }
      if (ui.kind === 'check') {
        const check = pluginManager?.checks.find((c) => c.id === ui.id)
        return check ? check.enabled : true
      }
      return true
    })
  }, [catalog, pluginManager])

  const dashboardWidgets = useMemo(() => {
    if (!catalog) return []
    const out: DashboardWidgetModule[] = []
    for (const entry of catalog) {
      const ui = uiModules.find((m) => isLoaded(entry, m))
      if (!ui || !hasDashboardWidget(ui)) continue
      if (ui.kind === 'notify') {
        const notifier = pluginManager?.notifiers.find((n) => n.id === ui.id)
        if (notifier && !notifier.enabled) continue
      }
      if (ui.kind === 'check') {
        const check = pluginManager?.checks.find((c) => c.id === ui.id)
        if (check && !check.enabled) continue
      }
      out.push(ui)
    }
    return out
  }, [catalog, pluginManager])

  const nonDropdownUi = useMemo(
    () => activeUi.filter((ui) => ui.kind === 'scheduler'),
    [activeUi],
  )
  const checkUi = useMemo(() => activeUi.filter((ui) => ui.kind === 'check'), [activeUi])
  const notifierUi = useMemo(
    () => activeUi.filter((ui) => ui.kind === 'notify'),
    [activeUi],
  )
  const checksMenuActive = checkUi.some((ui) => ui.path === location.pathname)
  const notifierMenuActive = notifierUi.some((ui) => ui.path === location.pathname)

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <img
            className="brand-logo"
            src="/umpire-logo.png"
            alt="UMPIRE"
            width={56}
            height={56}
          />
          <div>
            <h1>UMPIRE</h1>
            <p>Universal Monitoring Plugin &amp; Incident Reporter</p>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/targets">Targets</NavLink>
          {nonDropdownUi.map((ui) => (
            <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
              {ui.label}
            </NavLink>
          ))}
          <details className={`nav-dropdown${checksMenuActive ? ' active' : ''}`}>
            <summary>Checks</summary>
            <div className="nav-dropdown-menu">
              {checkUi.length === 0 ? (
                <span className="muted small">No check pages</span>
              ) : (
                checkUi.map((ui) => (
                  <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
                    {ui.label}
                  </NavLink>
                ))
              )}
            </div>
          </details>
          <details className={`nav-dropdown${notifierMenuActive ? ' active' : ''}`}>
            <summary>Notifiers</summary>
            <div className="nav-dropdown-menu">
              {notifierUi.length === 0 ? (
                <span className="muted small">No notifier pages</span>
              ) : (
                notifierUi.map((ui) => (
                  <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
                    {ui.label}
                  </NavLink>
                ))
              )}
            </div>
          </details>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard widgets={dashboardWidgets} />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/targets" element={<Targets />} />
          {activeUi.map((ui) => (
            <Route
              key={`${ui.kind}:${ui.id}`}
              path={ui.path}
              element={<ui.Component />}
            />
          ))}
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
