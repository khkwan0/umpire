import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { api, type PluginCatalogEntry } from './api'
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
  const [catalog, setCatalog] = useState<PluginCatalogEntry[] | null>(null)

  useEffect(() => {
    void api.plugins
      .list()
      .then(setCatalog)
      .catch(() => setCatalog([]))
  }, [])

  const activeUi = useMemo(() => {
    if (!catalog) return []
    return uiModules.filter((ui) => catalog.some((e) => isLoaded(e, ui)))
  }, [catalog])

  const dashboardWidgets = useMemo(() => {
    if (!catalog) return []
    const out: DashboardWidgetModule[] = []
    for (const entry of catalog) {
      const ui = uiModules.find((m) => isLoaded(entry, m))
      if (ui && hasDashboardWidget(ui)) out.push(ui)
    }
    return out
  }, [catalog])

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
          {activeUi.map((ui) => (
            <NavLink key={`${ui.kind}:${ui.id}`} to={ui.path}>
              {ui.label}
            </NavLink>
          ))}
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
