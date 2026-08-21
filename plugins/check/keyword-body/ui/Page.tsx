import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { withBase } from '@umpire/web-api'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

interface KeywordBodyConfig {
  keyword: string
  caseSensitive: boolean
}
interface TargetRef {
  id: number
  url: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  if (init?.body != null && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const res = await fetch(withBase(path), { ...init, headers })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || res.statusText)
  }
  return body as T
}

export default function KeywordBodyCheckPage() {
  const [keyword, setKeyword] = useState('ok')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [targets, setTargets] = useState<TargetRef[]>([])
  const [targetId, setTargetId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    const nextTargets = await request<TargetRef[]>('/api/targets')
    setTargets(nextTargets)
    if (nextTargets.length === 0) {
      setLoaded(true)
      return
    }
    const selectedId = targetId ?? nextTargets[0]!.id
    const selected = nextTargets.find((t) => t.id === selectedId) ?? nextTargets[0]!
    const config = await request<KeywordBodyConfig>(
      `/api/plugins/check/keyword-body/targets/${selected.id}/config`,
    )
    setTargetId(selected.id)
    setKeyword(config.keyword)
    setCaseSensitive(config.caseSensitive)
    setLoaded(true)
  }, [targetId])

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
      if (!targetId) throw new Error('Select a target first')
      const saved = await request<KeywordBodyConfig>(
        `/api/plugins/check/keyword-body/targets/${targetId}/config`,
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
        Configure a per-target keyword match on HTTP response body.
      </p>
      {targets.length === 0 ? (
        <p className="muted">No targets available. Add a target first.</p>
      ) : (
        <label>
          Target
          <select
            value={targetId ?? ''}
            onChange={(e) => {
              const next = Number(e.target.value)
              setTargetId(Number.isFinite(next) ? next : null)
            }}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} {t.url}
              </option>
            ))}
          </select>
        </label>
      )}
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
        <button type="submit" disabled={busy || !targetId}>
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
