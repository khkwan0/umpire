import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { withBase } from '@umpire/web-api'
import type { DashboardWidgetProps } from '@umpire/plugin-ui'

type EmailMode = 'sendmail' | 'smtp'

interface EmailSmtpConfig {
  host: string
  port: number
  secure: boolean
  username: string
  password: string
}

interface EmailConfig {
  mode: EmailMode
  from: string
  to: string[]
  sendmailPath: string
  smtp: EmailSmtpConfig
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
  const res = await fetch(withBase(path), { ...init, headers })
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
  const [mode, setMode] = useState<EmailMode>('sendmail')
  const [from, setFrom] = useState('')
  const [toTextValue, setToTextValue] = useState('')
  const [sendmailPath, setSendmailPath] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpSecure, setSmtpSecure] = useState(true)
  const [smtpUsername, setSmtpUsername] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)

  const recipients = useMemo(() => parseList(toTextValue), [toTextValue])

  const load = useCallback(async () => {
    const config = await request<EmailConfig>('/api/plugins/notify/email/config')
    setMode(config.mode)
    setFrom(config.from)
    setToTextValue(toText(config.to))
    setSendmailPath(config.sendmailPath)
    setSmtpHost(config.smtp.host)
    setSmtpPort(config.smtp.port)
    setSmtpSecure(config.smtp.secure)
    setSmtpUsername(config.smtp.username)
    setSmtpPassword(config.smtp.password)
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
        body: JSON.stringify({
          mode,
          from: from.trim(),
          to: recipients,
          sendmailPath: sendmailPath.trim(),
          smtp: {
            host: smtpHost.trim(),
            port: smtpPort,
            secure: smtpSecure,
            username: smtpUsername.trim(),
            password: smtpPassword,
          },
        }),
      })
      setMode(saved.mode)
      setFrom(saved.from)
      setToTextValue(toText(saved.to))
      setSendmailPath(saved.sendmailPath)
      setSmtpHost(saved.smtp.host)
      setSmtpPort(saved.smtp.port)
      setSmtpSecure(saved.smtp.secure)
      setSmtpUsername(saved.smtp.username)
      setSmtpPassword(saved.smtp.password)
      setMessage(
        saved.from && saved.to.length > 0 ? 'Saved' : 'Saved (missing from/to — notifier off)',
      )
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
          Sends alerts using local <code>sendmail</code> or external SMTP.
        </p>
        <form className="form-col" onSubmit={onSave}>
          <label>
            Mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as EmailMode)}
            >
              <option value="sendmail">Sendmail (local)</option>
              <option value="smtp">SMTP (external server)</option>
            </select>
          </label>
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
          {mode === 'sendmail' ? (
            <label>
              Sendmail path (optional)
              <input
                value={sendmailPath}
                onChange={(e) => setSendmailPath(e.target.value)}
                placeholder="sendmail"
                spellCheck={false}
              />
            </label>
          ) : (
            <>
              <label>
                SMTP host
                <input
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.example.com"
                  spellCheck={false}
                />
              </label>
              <label>
                SMTP port
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                />
              </label>
              <label className="check-ids-item">
                <input
                  type="checkbox"
                  checked={smtpSecure}
                  onChange={(e) => setSmtpSecure(e.target.checked)}
                />
                Use TLS/SSL
              </label>
              <label>
                SMTP username
                <input
                  value={smtpUsername}
                  onChange={(e) => setSmtpUsername(e.target.value)}
                  spellCheck={false}
                />
              </label>
              <label>
                SMTP password
                <input
                  type="password"
                  value={smtpPassword}
                  onChange={(e) => setSmtpPassword(e.target.value)}
                  spellCheck={false}
                />
              </label>
            </>
          )}
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
            <button
              type="button"
              disabled={testing || !from.trim() || recipients.length === 0}
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
      {ready
        ? 'Email notifier is configured.'
        : 'Set mode + from/to (and SMTP credentials if using SMTP) to enable alerts.'}
    </p>
  )
}
