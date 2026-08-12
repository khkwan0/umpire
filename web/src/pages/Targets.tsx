import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, type Target } from '../api'

export default function Targets() {
  const [targets, setTargets] = useState<Target[]>([])
  const [url, setUrl] = useState('https://')
  const [interval, setIntervalSeconds] = useState(60)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setTargets(await api.targets.list())
  }, [])

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.targets.create({
        url: url.trim(),
        interval_seconds: interval,
        enabled: true,
      })
      setUrl('https://')
      setIntervalSeconds(60)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function toggle(t: Target) {
    await api.targets.update(t.id, { enabled: !t.enabled })
    await load()
  }

  async function remove(id: number) {
    if (!confirm('Delete this target?')) return
    await api.targets.remove(id)
    await load()
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Add target</h2>
        <form className="form-row" onSubmit={onCreate}>
          <label>
            URL
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              required
            />
          </label>
          <label>
            Interval (seconds)
            <input
              type="number"
              min={5}
              value={interval}
              onChange={(e) => setIntervalSeconds(Number(e.target.value))}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Configured targets</h2>
        {targets.length === 0 ? (
          <p className="muted">No targets.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>URL</th>
                <th>Interval</th>
                <th>Enabled</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.url}</td>
                  <td>{t.interval_seconds}s</td>
                  <td>{t.enabled ? 'yes' : 'no'}</td>
                  <td className="actions">
                    <button type="button" onClick={() => void toggle(t)}>
                      {t.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void remove(t.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
