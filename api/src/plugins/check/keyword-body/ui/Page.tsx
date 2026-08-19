import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

interface KeywordBodyConfig {
  keyword: string
  caseSensitive: boolean
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

export default function KeywordBodyCheckPage() {
  const [keyword, setKeyword] = useState('ok')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const config = await request<KeywordBodyConfig>(
      '/api/plugins/check/keyword-body/config',
    )
    setKeyword(config.keyword)
    setCaseSensitive(config.caseSensitive)
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
    try {
      const saved = await request<KeywordBodyConfig>(
        '/api/plugins/check/keyword-body/config',
        {
          method: 'PUT',
          body: JSON.stringify({ keyword, caseSensitive }),
        },
      )
      setKeyword(saved.keyword)
      setCaseSensitive(saved.caseSensitive)
      setMessage('Saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!loaded && !error) return <p className="muted">Loading…</p>

  return (
    <section className="panel stack">
      <h2>Keyword/body check</h2>
      <p className="muted">
        Sends an HTTP GET request and marks the check healthy only when the
        response body contains the configured keyword.
      </p>
      <form className="form-col" onSubmit={onSave}>
        <label>
          Keyword
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="ok"
            spellCheck={false}
          />
        </label>
        <label className="row">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
          />
          <span>Case sensitive matching</span>
        </label>
        <button type="submit" disabled={busy}>
          Save
        </button>
      </form>
      {message && <p className="ok-text">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  )
}

export function KeywordBodyCheckWidget({ status }: DashboardWidgetProps) {
  const loaded = status.checks.some((c) => c.id === 'keyword-body')
  return (
    <p className="muted">
      {loaded
        ? 'Keyword/body check plugin is loaded and available to targets.'
        : 'Keyword/body check plugin is not loaded.'}
    </p>
  )
}
