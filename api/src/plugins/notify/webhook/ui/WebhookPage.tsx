import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

export interface WebhookConfig {
  url: string
  headers: Record<string, string>
}

export interface WebhookTestResult {
  ok: boolean
  error: string | null
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await fetch(path, { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return body as T
}

function headersToText(headers: Record<string, string>): string {
  const keys = Object.keys(headers)
  if (keys.length === 0) return ''
  return JSON.stringify(headers, null, 2)
}

function parseHeadersText(raw: string): Record<string, string> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  const parsed = JSON.parse(trimmed) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('headers must be a JSON object of strings')
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v !== 'string') {
      throw new Error('headers values must be strings')
    }
    out[k] = v
  }
  return out
}

export default function WebhookPage() {
  const [url, setUrl] = useState('')
  const [headersText, setHeadersText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<WebhookTestResult | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const config = await request<WebhookConfig>(
      '/api/plugins/notify/webhook/config',
    )
    setUrl(config.url)
    setHeadersText(headersToText(config.headers))
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setMessage(null)
    setTest(null)
    try {
      const saved = await request<WebhookConfig>(
        '/api/plugins/notify/webhook/config',
        {
          method: 'PUT',
          body: JSON.stringify({
            url: url.trim(),
            headers: parseHeadersText(headersText),
          }),
        },
      )
      setUrl(saved.url)
      setHeadersText(headersToText(saved.headers))
      setMessage(saved.url ? 'Saved' : 'Saved (empty URL — notifier off)')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    setTesting(true)
    setError(null)
    setMessage(null)
    try {
      const saved = await request<WebhookConfig>(
        '/api/plugins/notify/webhook/config',
        {
          method: 'PUT',
          body: JSON.stringify({
            url: url.trim(),
            headers: parseHeadersText(headersText),
          }),
        },
      )
      setUrl(saved.url)
      setHeadersText(headersToText(saved.headers))
      const result = await request<WebhookTestResult>(
        '/api/plugins/notify/webhook/test',
        { method: 'POST' },
      )
      setTest(result)
    } catch (err) {
      setTest({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }

  if (!loaded && !error) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      <section className="panel">
        <h2>Webhook</h2>
        <p className="muted">
          On alert, core already decided to notify. This plugin POSTs the{' '}
          <code>AlertEvent</code> JSON to one URL. Config is plugin-owned (
          <code>data/webhook.json</code>), not core SQLite and not{' '}
          <code>.env</code>.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label className="grow">
            URL
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/hooks/umpire"
              spellCheck={false}
            />
          </label>
          <label>
            Extra headers (JSON object, optional)
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder='{"Authorization":"Bearer secret"}'
              spellCheck={false}
            />
          </label>
          <div className="form-row">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button
              type="button"
              disabled={testing || !url.trim()}
              onClick={() => void onTest()}
            >
              Send test
            </button>
          </div>
        </form>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
        {test && (
          <p className={test.ok ? 'ok-text' : 'error'}>
            {test.ok
              ? 'Test POST succeeded'
              : `Test failed: ${test.error ?? 'unknown error'}`}
          </p>
        )}
      </section>
    </div>
  )
}

export function WebhookWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find((n) => n.id === 'webhook')?.ready
  return (
    <p className="muted">
      {ready
        ? 'POSTs AlertEvent JSON to the configured URL.'
        : 'Set a webhook URL to enable delivery.'}
    </p>
  )
}
