import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

interface EmailConfig {
  from: string
  to: string[]
}

interface TestResult {
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

function toText(list: string[]): string {
  return list.join('\n')
}

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

export default function EmailPage() {
  const [from, setFrom] = useState('')
  const [toTextValue, setToTextValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  const recipients = useMemo(() => parseList(toTextValue), [toTextValue])

  const load = useCallback(async () => {
    const config = await request<EmailConfig>('/api/plugins/notify/email/config')
    setFrom(config.from)
    setToTextValue(toText(config.to))
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
      const saved = await request<EmailConfig>('/api/plugins/notify/email/config', {
        method: 'PUT',
        body: JSON.stringify({ from: from.trim(), to: recipients }),
      })
      setFrom(saved.from)
      setToTextValue(toText(saved.to))
      setMessage(saved.from && saved.to.length > 0 ? 'Saved' : 'Saved (missing from/to — notifier off)')
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
      const result = await request<TestResult>('/api/plugins/notify/email/test', {
        method: 'POST',
      })
      setTest(result)
    } catch (err) {
      setTest({ ok: false, error: err instanceof Error ? err.message : String(err) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Email</h2>
        <p className="muted">
          Sends alerts using local <code>sendmail</code>. Configure sender and recipients.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label>
            From
            <input
              type="email"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="monitor@example.com"
              spellCheck={false}
            />
          </label>
          <label>
            To (one per line or comma-separated)
            <textarea
              value={toTextValue}
              onChange={(e) => setToTextValue(e.target.value)}
              placeholder={'oncall@example.com\nsre@example.com'}
              spellCheck={false}
            />
          </label>
          <div className="form-row">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" disabled={testing || !from.trim() || recipients.length === 0} onClick={() => void onTest()}>
              Send test
            </button>
          </div>
        </form>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
        {test && (
          <p className={test.ok ? 'ok-text' : 'error'}>
            {test.ok ? 'Email test sent' : `Test failed: ${test.error ?? 'unknown error'}`}
          </p>
        )}
      </section>
    </div>
  )
}

export function EmailWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find((n) => n.id === 'email')?.ready
  return (
    <p className="muted">
      {ready ? 'Email notifier is configured.' : 'Set from/to addresses to enable alerts.'}
    </p>
  )
}
