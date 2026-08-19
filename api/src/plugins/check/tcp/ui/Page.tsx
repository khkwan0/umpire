import type { DashboardWidgetProps } from '@umpire/plugin-ui'

export default function TcpCheckPage() {
  return (
    <section className="panel stack">
      <h2>TCP check</h2>
      <p className="muted">
        Verifies TCP connectivity to the target host and port. Port is derived from
        the URL when explicit port is not set.
      </p>
      <p className="muted small">
        Default ports: <code>80</code> for <code>http</code>, <code>443</code> for{' '}
        <code>https</code>. Uses <code>CHECK_TIMEOUT_MS</code>.
      </p>
    </section>
  )
}

export function TcpCheckWidget({ status }: DashboardWidgetProps) {
  const loaded = status.checks.some((c) => c.id === 'tcp')
  return (
    <p className="muted">
      {loaded
        ? 'TCP check plugin is loaded and available to targets.'
        : 'TCP check plugin is not loaded.'}
    </p>
  )
}
