import { useEffect, useState, type FormEvent } from 'react'
import { api, type AlertPolicy, type Settings } from '../api'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [policy, setPolicy] = useState<AlertPolicy>('state_change')
  const [throttle, setThrottle] = useState(30)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void api.settings
      .get()
      .then((s) => {
        setSettings(s)
        setPolicy(s.alert_policy)
        setThrottle(s.throttle_minutes)
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }, [])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const next = await api.settings.put({
        alert_policy: policy,
        throttle_minutes: throttle,
      })
      setSettings(next)
      setMessage('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!settings && !error) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      <section className="panel">
        <h2>Alert policy</h2>
        <form className="form-col" onSubmit={onSave}>
          <label>
            Policy
            <select
              value={policy}
              onChange={(e) => setPolicy(e.target.value as AlertPolicy)}
            >
              <option value="state_change">
                State change (down once, recover once)
              </option>
              <option value="every_fail">Every failed check</option>
              <option value="throttle">
                Throttle (first fail, then at most every N minutes)
              </option>
            </select>
          </label>
          <label>
            Throttle minutes
            <input
              type="number"
              min={1}
              value={throttle}
              onChange={(e) => setThrottle(Number(e.target.value))}
              disabled={policy !== 'throttle'}
            />
          </label>
          <button type="submit" disabled={busy}>
            Save
          </button>
        </form>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  )
}
