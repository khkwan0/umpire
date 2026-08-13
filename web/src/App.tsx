import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Groups from './pages/Groups'
import Targets from './pages/Targets'
import Tokens from './pages/Tokens'
import SettingsPage from './pages/Settings'

export default function App() {
  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">YAMT</span>
          <div>
            <h1>Yet Another Monitoring Tool</h1>
            <p>HTTP uptime checks with FCM alerts</p>
          </div>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/groups">Groups</NavLink>
          <NavLink to="/targets">Targets</NavLink>
          <NavLink to="/tokens">Tokens</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/targets" element={<Targets />} />
          <Route path="/tokens" element={<Tokens />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
