import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

const METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT',
] as const

type HttpMethod = (typeof METHODS)[number]

interface HttpCheckConfig {
  method: HttpMethod
  headers: Record<string, string>
  body: string
  acceptedStatusRanges: StatusRange[]
  maxLatencyMs: number | null
}

type StatusRange = '1xx' | '2xx' | '3xx' | '4xx' | '5xx'
const STATUS_RANGES: StatusRange[] = ['1xx', '2xx', '3xx', '4xx', '5xx']

interface HttpCheckTestResult {
  ok: boolean
  statusCode: number | null
  error: string | null
  latencyMs: number
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

export default function HttpCheckPage() {
  const [method, setMethod] = useState<HttpMethod>('GET')
  const [testUrl, setTestUrl] = useState('https://')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [acceptedStatusRanges, setAcceptedStatusRanges] = useState<StatusRange[]>([
    '2xx',
  ])
  const [maxLatencyMs, setMaxLatencyMs] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<HttpCheckTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const config = await request<HttpCheckConfig>('/api/plugins/check/http/config')
    setMethod(config.method)
    setHeadersText(headersToText(config.headers))
    setBodyText(config.body)
    setAcceptedStatusRanges(config.acceptedStatusRanges)
    setMaxLatencyMs(
      config.maxLatencyMs == null ? '' : String(Math.floor(config.maxLatencyMs)),
    )
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
    setTestResult(null)
    try {
      const saved = await request<HttpCheckConfig>('/api/plugins/check/http/config', {
        method: 'PUT',
        body: JSON.stringify({
          method,
          headers: parseHeadersText(headersText),
          body: bodyText,
          acceptedStatusRanges,
          maxLatencyMs: maxLatencyMs.trim() ? Number(maxLatencyMs) : null,
        }),
      })
      setMethod(saved.method)
      setHeadersText(headersToText(saved.headers))
      setBodyText(saved.body)
      setAcceptedStatusRanges(saved.acceptedStatusRanges)
      setMaxLatencyMs(
        saved.maxLatencyMs == null ? '' : String(Math.floor(saved.maxLatencyMs)),
      )
      setMessage('Saved')
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
    setTestResult(null)
    try {
      const result = await request<HttpCheckTestResult>('/api/plugins/check/http/test', {
        method: 'POST',
        body: JSON.stringify({
          url: testUrl.trim(),
          method,
          headers: parseHeadersText(headersText),
          body: bodyText,
          acceptedStatusRanges,
          maxLatencyMs: maxLatencyMs.trim() ? Number(maxLatencyMs) : null,
        }),
      })
      setTestResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  if (!loaded && !error) return <p className="muted">Loading…</p>

  return (
    <div className="stack">
      <section className="panel">
        <h2>HTTP check</h2>
        <p className="muted">
          Configure request method, headers, and body for all targets using this
          check plugin. You can also configure accepted status ranges and an
          optional latency SLO threshold.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label>
            Method
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as HttpMethod)}
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            Headers (JSON object, optional)
            <textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder='{"Authorization":"Bearer token"}'
              spellCheck={false}
            />
          </label>
          <label>
            Accepted status ranges
            <div className="form-col">
              {STATUS_RANGES.map((range) => (
                <label key={range} className="row">
                  <input
                    type="checkbox"
                    checked={acceptedStatusRanges.includes(range)}
                    onChange={(e) => {
                      setAcceptedStatusRanges((prev) => {
                        if (e.target.checked) return [...prev, range]
                        if (prev.length === 1 && prev[0] === range) return prev
                        return prev.filter((r) => r !== range)
                      })
                    }}
                  />
                  <span>{range}</span>
                </label>
              ))}
            </div>
          </label>
          <label>
            Max latency (ms, optional)
            <input
              type="number"
              min={1}
              step={1}
              value={maxLatencyMs}
              onChange={(e) => setMaxLatencyMs(e.target.value)}
              placeholder="1500"
            />
          </label>
          <label>
            Body (optional)
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder='{"ping":true}'
              spellCheck={false}
            />
          </label>
          <button type="submit" disabled={busy}>
            Save
          </button>
        </form>
        <div className="form-col">
          <label>
            Test URL
            <input
              type="url"
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://example.com/health"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            disabled={testing || !testUrl.trim()}
            onClick={() => void onTest()}
          >
            Send test
          </button>
        </div>
        <p className="muted small">
          Timeout is controlled by <code>CHECK_TIMEOUT_MS</code> (default
          10000 ms). Redirects are followed. Default User-Agent is{' '}
          <code>umpire/1.0</code>.
        </p>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
        {testResult && (
          <p className={testResult.ok ? 'ok-text' : 'error'}>
            {testResult.ok
              ? `Test passed (HTTP ${testResult.statusCode}, ${Math.round(testResult.latencyMs)}ms)`
              : `Test failed: ${testResult.error ?? 'unknown error'} (${Math.round(testResult.latencyMs)}ms)`}
          </p>
        )}
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
