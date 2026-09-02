import {useState, type FormEvent} from 'react'
import {Navigate, useNavigate} from 'react-router-dom'
import {useAuth} from '../auth'
import {assetUrl} from '../basePath'

export default function LoginPage() {
  const {ready, policy, principal, login} = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!ready) return <p className="muted">Loading…</p>

  if (principal?.kind === 'user') {
    return <Navigate to="/" replace />
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/', {replace: true})
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-shell">
      <div className="login-panel panel">
        <div className="brand login-brand">
          <img
            className="brand-logo"
            src={assetUrl('umpire_logo.svg')}
            alt="UMPIRE"
            width={96}
            height={96}
          />
          <div>
            <h1>UMPIRE</h1>
            <p>Sign in to continue</p>
            {policy?.allow_readonly_without_auth && (
              <p className="muted small">
                Read-only access is available without signing in. Sign in for
                write access.
              </p>
            )}
          </div>
        </div>
        <form className="form-col" onSubmit={onSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  )
}
