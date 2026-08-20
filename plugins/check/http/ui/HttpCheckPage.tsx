import { useCallback, useEffect, useState } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'
import {
  HttpCheckFields,
  HttpCheckFootnotes,
  configToForm,
  onSaveDefaultsForm,
  request,
  type FormValues,
  type HttpCheckConfig,
} from './httpCheckUiShared'

export default function HttpCheckPage() {
  const [defaultsForm, setDefaultsForm] = useState<FormValues>(
    configToForm({
      method: 'GET',
      headers: {},
      body: '',
      acceptedStatusRanges: ['2xx'],
      acceptedStatusCodes: [],
      maxLatencyMs: null,
    }),
  )
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const nextDefaults = await request<HttpCheckConfig>(
      '/api/plugins/check/http/config',
    )
    setDefaultsForm(configToForm(nextDefaults))
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  if (!loaded && !error) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      <section className="panel">
        <h2>Default HTTP check parameters</h2>
        <p className="muted">
          Used by every target unless a target has custom settings. Per-target
          overrides are configured from the Targets page. Saved to{' '}
          <code>data/http-check-defaults.json</code>.
        </p>
        <form
          className="form-col"
          onSubmit={(e) =>
            void onSaveDefaultsForm(
              e,
              defaultsForm,
              setDefaultsForm,
              setMessage,
              setError,
              setBusy,
            )
          }
        >
          <HttpCheckFields
            idPrefix="defaults"
            form={defaultsForm}
            onChange={setDefaultsForm}
          />
          <button type="submit" disabled={busy}>
            Save defaults
          </button>
        </form>
        <HttpCheckFootnotes />
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  )
}

export function HttpCheckWidget({ status }: DashboardWidgetProps) {
  const loaded = status.checks.some((c) => c.id === 'http')
  return (
    <p className="muted">
      {loaded
        ? 'HTTP check plugin is loaded and available to targets.'
        : 'HTTP check plugin is not loaded.'}
    </p>
  )
}
