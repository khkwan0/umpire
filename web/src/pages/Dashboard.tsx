import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type StatusResponse } from '../api'

function statusLabel(isUp: number | null, enabled: number): string {
  if (!enabled) return 'paused'
  if (isUp === null) return 'pending'
  return isUp ? 'up' : 'down'
}

export default function Dashboard() {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await api.status())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 5000)
    return () => clearInterval(id)
  }, [load])

  if (error) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const up = data.targets.filter((t) => t.enabled && t.is_up === 1).length
  const down = data.targets.filter((t) => t.enabled && t.is_up === 0).length
  const paused = data.targets.filter((t) => !t.enabled).length

  return (
    <div className="stack">
      <section className="hero-stats">
        <div>
          <strong>{up}</strong>
          <span>up</span>
        </div>
        <div>
          <strong className={down ? 'bad' : ''}>{down}</strong>
          <span>down</span>
        </div>
        <div>
          <strong>{paused}</strong>
          <span>paused</span>
        </div>
        <div>
          <strong className={data.fcm_ready ? 'ok' : 'warn'}>
            {data.fcm_ready ? 'ready' : 'off'}
          </strong>
          <span>FCM</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Targets</h2>
          <Link to="/targets">Manage</Link>
        </div>
        {data.targets.length === 0 ? (
          <p className="muted">
            No targets yet. <Link to="/targets">Add one</Link>.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>URL</th>
                <th>Interval</th>
                <th>Last check</th>
                <th>Latency</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.targets.map((t) => {
                const label = statusLabel(t.is_up, t.enabled)
                return (
                  <tr key={t.id}>
                    <td>
                      <span className={`pill ${label}`}>{label}</span>
                    </td>
                    <td className="mono">{t.url}</td>
                    <td>{t.interval_seconds}s</td>
                    <td>{t.last_checked_at ?? '—'}</td>
                    <td>
                      {t.last_latency_ms != null ? `${t.last_latency_ms}ms` : '—'}
                    </td>
                    <td className="muted">
                      {t.last_error ||
                        (t.last_status_code != null
                          ? `HTTP ${t.last_status_code}`
                          : '—')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <p className="muted small">
        Policy: {data.settings.alert_policy}
        {data.settings.alert_policy === 'throttle'
          ? ` (${data.settings.throttle_minutes}m)`
          : ''}
      </p>
    </div>
  )
}
