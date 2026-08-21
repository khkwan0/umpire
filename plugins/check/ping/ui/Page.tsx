import type { DashboardWidgetProps } from '@umpire/plugin-ui'

export default function PingCheckPage() {
  return (
    <section className="panel stack">
      <h2>Ping check</h2>
      <p className="muted">
        Runs an ICMP ping against the target hostname or IP. A full URL is not
        required — <code>example.com</code> or <code>10.0.0.5</code> is enough.
      </p>
      <p className="muted small">
        Uses system <code>ping</code>. Some hosts block ICMP; in that case use
        HTTP or TCP checks too.
      </p>
    </section>
  )
}

export function PingCheckWidget({ status }: DashboardWidgetProps) {
  const loaded = status.checks.some((c) => c.id === 'ping')
  return (
    <p className="muted">
      {loaded
        ? 'Ping check plugin is loaded and available to targets.'
        : 'Ping check plugin is not loaded.'}
    </p>
  )
}
