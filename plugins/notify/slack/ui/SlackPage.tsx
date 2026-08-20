import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

interface SlackConfig {
  webhookUrl: string
  username: string
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

export default function SlackPage() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [username, setUsername] = useState('UMPIRE')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  const load = useCallback(async () => {
    const config = await request<SlackConfig>('/api/plugins/notify/slack/config')
    setWebhookUrl(config.webhookUrl)
    setUsername(config.username || 'UMPIRE')
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
      const saved = await request<SlackConfig>('/api/plugins/notify/slack/config', {
        method: 'PUT',
        body: JSON.stringify({ webhookUrl: webhookUrl.trim(), username: username.trim() || 'UMPIRE' }),
      })
      setWebhookUrl(saved.webhookUrl)
      setUsername(saved.username || 'UMPIRE')
      setMessage(saved.webhookUrl ? 'Saved' : 'Saved (empty webhookUrl — notifier off)')
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
      const result = await request<TestResult>('/api/plugins/notify/slack/test', {
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
        <h2>Slack</h2>
        <p className="muted">
          Sends alerts to a Slack incoming webhook.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label className="grow">
            Webhook URL
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://hooks.slack.com/services/..."
              spellCheck={false}
            />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="UMPIRE"
              spellCheck={false}
            />
          </label>
          <div className="form-row">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" disabled={testing || !webhookUrl.trim()} onClick={() => void onTest()}>
              Send test
            </button>
          </div>
        </form>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
        {test && (
          <p className={test.ok ? 'ok-text' : 'error'}>
            {test.ok ? 'Slack test sent' : `Test failed: ${test.error ?? 'unknown error'}`}
          </p>
        )}
      </section>
    </div>
  )
}

export function SlackWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find((n) => n.id === 'slack')?.ready
  return (
    <p className="muted">
      {ready ? 'Slack notifier is configured.' : 'Set a Slack webhook URL to enable alerts.'}
    </p>
  )
}
