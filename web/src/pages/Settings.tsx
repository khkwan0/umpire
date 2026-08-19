import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  isTransientApiError,
  type AlertPolicy,
  type PluginManagerState,
  type Settings,
} from '../api'
import ReconnectBanner from '../ReconnectBanner'

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [policy, setPolicy] = useState<AlertPolicy>('state_change')
  const [throttle, setThrottle] = useState(30)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [plugins, setPlugins] = useState<PluginManagerState | null>(null)
  const [pluginBusy, setPluginBusy] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([api.settings.get(), api.pluginManager.get()])
      .then(([s, p]) => {
        setSettings(s)
        setPolicy(s.alert_policy)
        setThrottle(s.throttle_minutes)
        setPlugins(p)
        setError(null)
        setReconnecting(false)
      })
      .catch((err) => {
        if (isTransientApiError(err)) {
          setReconnecting(true)
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setReconnecting(false)
      })
  }, [])

  async function togglePlugin(
    kind: 'check' | 'notify' | 'scheduler',
    id: string,
    enabled: boolean,
  ) {
    const key = `${kind}:${id}`
    setPluginBusy(key)
    setError(null)
    setMessage(null)
    try {
      await api.pluginManager.setEnabled(kind, id, enabled)
      const next = await api.pluginManager.get()
      setPlugins(next)
      setMessage('Plugin state updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPluginBusy(null)
    }
  }

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

  if (!settings && !error && !reconnecting) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      {reconnecting && <ReconnectBanner />}
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

      <section className="panel">
        <h2>Plugin manager</h2>
        {!plugins ? (
          <p className="muted">Loading plugins…</p>
        ) : (
          <div className="stack">
            <div>
              <h3>Scheduler</h3>
              <label className="check-ids-item">
                <input
                  type="checkbox"
                  checked={plugins.scheduler.enabled}
                  disabled={pluginBusy === `scheduler:${plugins.scheduler.id}`}
                  onChange={(e) =>
                    void togglePlugin(
                      'scheduler',
                      plugins.scheduler.id,
                      e.target.checked,
                    )
                  }
                />
                {plugins.scheduler.id}
              </label>
            </div>

            <div>
              <h3>Checks</h3>
              <div className="check-ids-list">
                {plugins.checks.map((c) => (
                  <label key={c.id} className="check-ids-item">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      disabled={pluginBusy === `check:${c.id}`}
                      onChange={(e) =>
                        void togglePlugin('check', c.id, e.target.checked)
                      }
                    />
                    {c.id}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3>Notifiers</h3>
              <div className="check-ids-list">
                {plugins.notifiers.map((n) => (
                  <label key={n.id} className="check-ids-item">
                    <input
                      type="checkbox"
                      checked={n.enabled}
                      disabled={pluginBusy === `notify:${n.id}`}
                      onChange={(e) =>
                        void togglePlugin('notify', n.id, e.target.checked)
                      }
                    />
                    {n.id}
                    {!n.ready ? ' (not ready)' : ''}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
