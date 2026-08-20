import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  api,
  type FcmDestination,
  type FcmDestinationImportResult,
  type FcmDestinationTestResult,
} from '@umpire/web-api'

function DestinationField({
  value,
  ariaLabel,
  className,
  required,
  onSave,
}: {
  value: string
  ariaLabel: string
  className?: string
  required?: boolean
  onSave: (next: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])

  async function commit() {
    const next = draft.trim()
    if (required && !next) {
      setDraft(value)
      return
    }
    if (next === value.trim()) {
      setDraft(value)
      return
    }
    try {
      await onSave(next)
    } catch {
      setDraft(value)
    }
  }

  return (
    <input
      className={className}
      aria-label={ariaLabel}
      title={draft}
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          setDraft(value)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export default function TokensPage() {
  const [tokens, setTokens] = useState<FcmDestination[]>([])
  const [fid, setFid] = useState('')
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draftTest, setDraftTest] = useState<FcmDestinationTestResult | null>(null)
  const [testingId, setTestingId] = useState<number | 'draft' | null>(null)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<FcmDestinationImportResult | null>(
    null,
  )
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setTokens(await api.tokens.list())
  }, [])

  useEffect(() => {
    void load().catch((err) =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setDraftTest(null)
    try {
      await api.tokens.create({ fid: fid.trim(), label: label.trim() })
      setFid('')
      setLabel('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function changeLabel(t: FcmDestination, next: string) {
    setError(null)
    try {
      await api.tokens.update(t.id, { label: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async function changeDestination(t: FcmDestination, next: string) {
    setError(null)
    try {
      await api.tokens.update(t.id, { fid: next })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      throw err
    }
  }

  async function toggleEnabled(t: FcmDestination) {
    setError(null)
    try {
      await api.tokens.update(t.id, { enabled: !t.enabled })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function remove(id: number) {
    if (!confirm('Delete this destination?')) return
    await api.tokens.remove(id)
    await load()
  }

  async function testDraft() {
    const value = fid.trim()
    if (!value) {
      setError('fid required')
      return
    }
    setTestingId('draft')
    setError(null)
    try {
      setDraftTest(await api.tokens.testRaw(value))
    } catch (err) {
      setDraftTest(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTestingId(null)
    }
  }

  async function testSaved(t: FcmDestination) {
    setTestingId(t.id)
    setError(null)
    try {
      const updated = await api.tokens.test(t.id)
      setTokens((prev) => prev.map((row) => (row.id === updated.id ? updated : row)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTestingId(null)
    }
  }

  function testStatus(ok: number | boolean | null, errorText: string | null) {
    if (ok === null || ok === undefined) {
      return <span className="muted">—</span>
    }
    if (ok === 2) {
      return <span className="pill pending">sent</span>
    }
    const passed = ok === true || ok === 1
    return (
      <>
        <span className={`pill ${passed ? 'up' : 'down'}`}>
          {passed ? 'ok' : 'error'}
        </span>
        {!passed && errorText ? (
          <span className="muted small error-detail">{errorText}</span>
        ) : null}
      </>
    )
  }

  async function markReceived(t: FcmDestination, received: boolean) {
    setError(null)
    try {
      const updated = await api.tokens.received(t.id, received)
      setTokens((prev) =>
        prev.map((row) => (row.id === updated.id ? updated : row)),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function parseImportJson(text: string): unknown {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('invalid JSON')
    }
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') {
      const rec = parsed as { fids?: unknown }
      if (Array.isArray(rec.fids)) return parsed
    }
    throw new Error('JSON must be an array, or { "fids": [...] }')
  }

  async function onImport(e: FormEvent) {
    e.preventDefault()
    setImportBusy(true)
    setImportError(null)
    setImportResult(null)
    try {
      const parsed = parseImportJson(importText)
      const payload = Array.isArray(parsed) ? { fids: parsed } : parsed
      const result = await api.tokens.import(payload)
      setImportResult(result)
      setImportText('')
      if (fileRef.current) fileRef.current.value = ''
      await load()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    } finally {
      setImportBusy(false)
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return
    setImportError(null)
    setImportResult(null)
    try {
      const text = await file.text()
      setImportText(text)
      parseImportJson(text)
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Add FCM FID</h2>
        <p className="muted">
          Register Firebase Installation IDs here. Per-target routing (which
          destinations and checks) is configured on{' '}
          <strong>Targets → fcm settings</strong>. Without an override, alerts
          go to all enabled destinations. Test asks FCM to send; confirm with Got
          it / Not received.
        </p>
        <form className="form-row" onSubmit={onCreate}>
          <label className="grow">
            FID
            <input
              value={fid}
              onChange={(e) => setFid(e.target.value)}
              placeholder="Firebase Installation ID"
              required
            />
          </label>
          <label>
            Label
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ken phone"
            />
          </label>
          <button type="submit" disabled={busy}>
            Add
          </button>
          <button
            type="button"
            disabled={busy || testingId !== null || !fid.trim()}
            onClick={() => void testDraft()}
          >
            {testingId === 'draft' ? 'Testing…' : 'Test'}
          </button>
        </form>
        {draftTest && (
          <p className={draftTest.ok ? 'ok' : 'error'}>
            {draftTest.ok ? 'ok' : `error: ${draftTest.error || 'send failed'}`}
          </p>
        )}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel">
        <h2>Import FIDs</h2>
        <p className="muted">
          Paste a JSON array or upload a <span className="mono">.json</span>{' '}
          file. Each item may be a FID string or{' '}
          <span className="mono">{'{ "fid", "label?" }'}</span>. Duplicates are
          skipped.
        </p>
        <form className="form-col" onSubmit={onImport} style={{ maxWidth: 'none' }}>
          <label className="grow">
            JSON
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={'["fid-one", { "fid": "fid-two", "label": "Ken phone" }]'}
              spellCheck={false}
              required
            />
          </label>
          <div className="form-row">
            <label>
              File
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                onChange={(e) => void onImportFile(e.target.files?.[0])}
              />
            </label>
            <button type="submit" disabled={importBusy || !importText.trim()}>
              {importBusy ? 'Importing…' : 'Import'}
            </button>
          </div>
        </form>
        {importResult && (
          <p className={importResult.created.length ? 'ok' : 'muted'}>
            Added {importResult.created.length}
            {importResult.skipped.length
              ? `, skipped ${importResult.skipped.length}`
              : ''}
            .
          </p>
        )}
        {importResult && importResult.skipped.length > 0 && (
          <ul className="muted small">
            {importResult.skipped.map((row, i) => (
              <li key={`${row.fid}-${i}`}>
                <span className="mono" title={row.fid}>
                  {row.fid}
                </span>{' '}
                — {row.reason}
              </li>
            ))}
          </ul>
        )}
        {importError && <p className="error">{importError}</p>}
      </section>

      <section className="panel">
        <h2>Destinations</h2>
        <p className="muted small">
          Click a label or FID to edit it. Enter or blur saves; Escape cancels.
          Changing the FID clears the last test result.{' '}
          <strong>sent</strong> means FCM accepted it — not that a banner
          appeared. Use <strong>Got it</strong> or <strong>Not received</strong>{' '}
          after each test.
        </p>
        {tokens.length === 0 ? (
          <p className="muted">No destinations.</p>
        ) : (
          <table className="tokens-table">
            <thead>
              <tr>
                <th>Label</th>
                <th>FID</th>
                <th>Enabled</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id}>
                  <td>
                    <DestinationField
                      value={t.label}
                      ariaLabel={`Label for destination ${t.id}`}
                      className="cell-input"
                      onSave={(next) => changeLabel(t, next)}
                    />
                  </td>
                  <td>
                    <DestinationField
                      value={t.fid}
                      ariaLabel={`FID for destination ${t.id}`}
                      className="cell-input mono truncate"
                      required
                      onSave={(next) => changeDestination(t, next)}
                    />
                  </td>
                  <td>{t.enabled ? 'yes' : 'no'}</td>
                  <td>
                    <div className="token-status">
                      {testStatus(
                        t.last_test_ok ?? null,
                        t.last_test_error ?? null,
                      )}
                      {t.last_test_ok === 2 && (
                        <div className="actions">
                          <button
                            type="button"
                            onClick={() => void markReceived(t, true)}
                          >
                            Got it
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => void markReceived(t, false)}
                          >
                            Not received
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="actions">
                      <button
                        type="button"
                        disabled={testingId !== null}
                        onClick={() => void testSaved(t)}
                      >
                        {testingId === t.id ? 'Testing…' : 'Test'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(t)}
                      >
                        {t.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => void remove(t.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
