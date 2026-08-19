import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

interface TelegramConfig {
  botToken: string
  chatId: string
  threadId: string
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

export default function TelegramPage() {
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [threadId, setThreadId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  const load = useCallback(async () => {
    const config = await request<TelegramConfig>('/api/plugins/notify/telegram/config')
    setBotToken(config.botToken)
    setChatId(config.chatId)
    setThreadId(config.threadId)
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
      const saved = await request<TelegramConfig>('/api/plugins/notify/telegram/config', {
        method: 'PUT',
        body: JSON.stringify({
          botToken: botToken.trim(),
          chatId: chatId.trim(),
          threadId: threadId.trim(),
        }),
      })
      setBotToken(saved.botToken)
      setChatId(saved.chatId)
      setThreadId(saved.threadId)
      setMessage(saved.botToken && saved.chatId ? 'Saved' : 'Saved (missing botToken/chatId — notifier off)')
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
      const result = await request<TestResult>('/api/plugins/notify/telegram/test', {
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
        <h2>Telegram</h2>
        <p className="muted">
          Sends alerts through Telegram Bot API using <code>botToken</code> and <code>chatId</code>.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label>
            Bot token
            <input
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="123456789:AA..."
              spellCheck={false}
            />
          </label>
          <label>
            Chat ID
            <input
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder="-1001234567890"
              spellCheck={false}
            />
          </label>
          <label>
            Thread ID (optional)
            <input
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              placeholder="42"
              spellCheck={false}
            />
          </label>
          <div className="form-row">
            <button type="submit" disabled={busy}>
              Save
            </button>
            <button type="button" disabled={testing || !botToken.trim() || !chatId.trim()} onClick={() => void onTest()}>
              Send test
            </button>
          </div>
        </form>
        {message && <p className="ok-text">{message}</p>}
        {error && <p className="error">{error}</p>}
        {test && (
          <p className={test.ok ? 'ok-text' : 'error'}>
            {test.ok ? 'Telegram test sent' : `Test failed: ${test.error ?? 'unknown error'}`}
          </p>
        )}
      </section>
    </div>
  )
}

export function TelegramWidget({ status }: DashboardWidgetProps) {
  const ready = status.notifiers.find((n) => n.id === 'telegram')?.ready
  return (
    <p className="muted">
      {ready ? 'Telegram notifier is configured.' : 'Set botToken and chatId to enable alerts.'}
    </p>
  )
}
