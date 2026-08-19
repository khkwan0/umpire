import type { DashboardWidgetProps } from '@umpire/plugin-ui'

export default function TlsCheckPage() {
  return (
    <section className="panel stack">
      <h2>TLS check</h2>
      <p className="muted">
        Validates TLS handshake for <code>https://</code> targets using certificate
        verification. Non-HTTPS targets fail this check.
      </p>
      <p className="muted small">
        Uses <code>CHECK_TIMEOUT_MS</code> for timeout control.
      </p>
    </section>
  )
}

export function TlsCheckWidget({ status }: DashboardWidgetProps) {
  const loaded = status.checks.some((c) => c.id === 'tls')
  return (
    <p className="muted">
      {loaded
        ? 'TLS check plugin is loaded and available to targets.'
        : 'TLS check plugin is not loaded.'}
    </p>
  )
}
