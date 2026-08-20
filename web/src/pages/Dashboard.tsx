import {useCallback, useEffect, useState} from 'react'
import {Link} from 'react-router-dom'
import {
  api,
  isTransientApiError,
  type Incident,
  type PluginManagerState,
  type StatusResponse,
} from '../api'
import ReconnectBanner from '../ReconnectBanner'
import {useRealtimeRefresh} from '../RealtimeProvider'
import type {DashboardWidgetModule} from '../plugin-ui'

function statusLabel(isUp: number | null, enabled: number): string {
  if (!enabled) return 'paused'
  if (isUp === null) return 'pending'
  if (isUp === 1) return 'up'
  if (isUp === 2) return 'partial'
  return 'down'
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rem = minutes % 60
  return rem ? `${hours}h ${rem}m` : `${hours}h`
}

function incidentLabel(incident: Incident): string {
  return incident.recovered ? 'recovered' : incident.status
}

export default function Dashboard({
  widgets = [],
}: {
  widgets?: DashboardWidgetModule[]
}) {
  const [data, setData] = useState<StatusResponse | null>(null)
  const [pluginState, setPluginState] = useState<PluginManagerState | null>(
    null,
  )
  const [incidents, setIncidents] = useState<Incident[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)

  const load = useCallback(async () => {
    try {
      const [status, log, manager] = await Promise.all([
        api.status(),
        api.incidents(50),
        api.pluginManager.get(),
      ])
      setData(status)
      setIncidents(log)
      setPluginState(manager)
      setError(null)
      setReconnecting(false)
    } catch (err) {
      if (isTransientApiError(err)) {
        setReconnecting(true)
        return
      }
      setError(err instanceof Error ? err.message : String(err))
      setReconnecting(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useRealtimeRefresh(load)

  if (error && !data) return <p className="error">{error}</p>
  if (!data) return <p className="muted">Loading…</p>

  const up = data.targets.filter(t => t.enabled && t.is_up === 1).length
  const partial = data.targets.filter(t => t.enabled && t.is_up === 2).length
  const down = data.targets.filter(t => t.enabled && t.is_up === 0).length
  const paused = data.targets.filter(t => !t.enabled).length
  const ongoing = (incidents ?? []).filter(i => !i.recovered).length
  const enabledChecks = pluginState?.checks.filter(c => c.enabled).length ?? 0
  const totalChecks = pluginState?.checks.length ?? 0
  const enabledNotifiers =
    pluginState?.notifiers.filter(n => n.enabled).length ?? 0
  const totalNotifiers = pluginState?.notifiers.length ?? 0
  const readyEnabledNotifiers =
    pluginState?.notifiers.filter(n => n.enabled && n.ready).length ?? 0

  return (
    <div className="stack">
      {reconnecting && <ReconnectBanner />}
      {error && <p className="error">{error}</p>}
      <section className="hero-stats">
        <div>
          <strong>{up}</strong>
          <span>up</span>
        </div>
        <div>
          <strong className={partial ? 'warn' : ''}>{partial}</strong>
          <span>wanring</span>
        </div>
        <div>
          <strong className={down ? 'bad' : ''}>{down}</strong>
          <span>down</span>
        </div>
        <div>
          <strong>{paused}</strong>
          <span>paused</span>
        </div>
        {pluginState && (
          <>
            <div>
              <strong>
                {enabledChecks}/{totalChecks}
              </strong>
              <span>checks enabled</span>
            </div>
            <div>
              <strong>
                {enabledNotifiers}/{totalNotifiers}
              </strong>
              <span>notifiers enabled</span>
              <div className="muted small">{readyEnabledNotifiers} ready</div>
            </div>
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Outages &amp; recovery</h2>
          {ongoing > 0 ? (
            <span className="pill down">{ongoing} ongoing</span>
          ) : (
            <span className="muted small">No ongoing outages</span>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>URL</th>
              <th>Started</th>
              <th>Recovered</th>
              <th>Duration</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {!incidents || incidents.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted center">
                  No outages recorded yet.
                </td>
              </tr>
            ) : (
              incidents.map(incident => {
                const label = incidentLabel(incident)
                return (
                  <tr key={`${incident.target_id}:${incident.id}`}>
                    <td>
                      <span className={`pill ${label}`}>{label}</span>
                    </td>
                    <td className="mono">
                      {incident.url}
                      {incident.group_tag ? (
                        <div className="muted small">{incident.group_tag}</div>
                      ) : null}
                    </td>
                    <td>{incident.started_at}</td>
                    <td>{incident.recovered_at ?? '—'}</td>
                    <td>{formatDuration(incident.duration_seconds)}</td>
                    <td className="muted">
                      {incident.error ||
                        (incident.status_code != null
                          ? `HTTP ${incident.status_code}`
                          : '—')}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      {widgets.map(ui => (
        <section key={`${ui.kind}:${ui.id}`} className="panel">
          <div className="panel-head">
            <h2>{ui.label}</h2>
            <Link to={ui.path}>Open</Link>
          </div>
          <ui.Dashboard status={data} />
        </section>
      ))}

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
              {data.targets.map(t => {
                const label = statusLabel(t.is_up, t.enabled)
                return (
                  <tr key={t.id}>
                    <td>
                      <span className={`pill ${label}`}>{label}</span>
                    </td>
                    <td className="mono">
                      {t.url}
                      {t.group_tag ? (
                        <div className="muted small">{t.group_tag}</div>
                      ) : null}
                    </td>
                    <td>{t.interval_seconds}s</td>
                    <td>{t.last_checked_at ?? '—'}</td>
                    <td>
                      {t.last_latency_ms != null
                        ? `${t.last_latency_ms}ms`
                        : '—'}
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
