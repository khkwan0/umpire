import type { DashboardWidgetProps } from '@umpire/plugin-ui'

export default function PingCheckPage() {
  return (
    <section className="panel stack">
      <h2>Ping check</h2>
      <p className="muted">
        Runs an ICMP ping probe against the target host. This validates basic
        network reachability at host level.
      </p>
      <p className="muted small">
        Uses system <code>ping</code> command. Some hosts may block ICMP; in that
        case use HTTP or TCP checks too.
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
