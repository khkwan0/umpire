import {useCallback, useEffect, useState, type FormEvent} from 'react'
import {Link, useParams} from 'react-router-dom'
import {
  HttpCheckFields,
  HttpCheckFootnotes,
  applyTargetConfigView,
  clearTargetOverride,
  configToForm,
  request,
  runTargetTest,
  saveTargetConfig,
  type FormValues,
  type HttpCheckTargetConfigView,
  type HttpCheckTestResult,
} from '../../../plugins/check/http/ui/httpCheckUiShared'

interface TargetRef {
  id: number
  url: string
}

export default function HttpCheckTargetOverride() {
  const {targetId: targetIdParam} = useParams<{targetId: string}>()
  const targetId = Number(targetIdParam)

  const [target, setTarget] = useState<TargetRef | null>(null)
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
  const [targetForm, setTargetForm] = useState<FormValues>(defaultsForm)
  const [useCustom, setUseCustom] = useState(false)
  const [testUrl, setTestUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<HttpCheckTestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!Number.isFinite(targetId) || targetId <= 0) {
      setError('Invalid target id')
      setLoaded(true)
      return
    }

    const [targets, view] = await Promise.all([
      request<TargetRef[]>('/api/targets'),
      request<HttpCheckTargetConfigView>(
        `/api/plugins/check/http/targets/${targetId}/config`,
      ),
    ])

    const selected = targets.find(t => t.id === targetId)
    if (!selected) {
      setError('Target not found')
      setLoaded(true)
      return
    }

    setTarget(selected)
    setTestUrl(selected.url)
    applyTargetConfigView(view, setUseCustom, setDefaultsForm, setTargetForm)
    setLoaded(true)
  }, [targetId])

  useEffect(() => {
    void load().catch(err =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!target) return
    setBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const view = await saveTargetConfig(target.id, useCustom, targetForm)
      applyTargetConfigView(view, setUseCustom, setDefaultsForm, setTargetForm)
      setSaveMessage(
        view.useCustom
          ? 'Saved — this target uses custom HTTP settings'
          : 'Saved — this target uses default HTTP settings',
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onClearOverride() {
    if (!target) return
    setBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const view = await clearTargetOverride(target.id)
      applyTargetConfigView(view, setUseCustom, setDefaultsForm, setTargetForm)
      setSaveMessage(
        'Override cleared — this target uses default HTTP settings',
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    if (!target) return
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const result = await runTargetTest(
        target.id,
        testUrl,
        useCustom,
        targetForm,
      )
      setTestResult(result)
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err))
    } finally {
      setTesting(false)
    }
  }

  if (!loaded && !error) return <p className="muted">Loading…</p>

  if (error && !target) {
    return (
      <div className="stack">
        <p className="error">{error}</p>
        <Link to="/targets">Back to targets</Link>
      </div>
    )
  }

  return (
    <div className="stack">
      <section className="panel">
        <p className="muted">
          <Link to="/targets">Targets</Link>
          {' · '}
          <Link to="/plugins/check/http">HTTP check defaults</Link>
        </p>
        <h2>HTTP check — target #{target!.id}</h2>
        <p className="mono">{target!.url}</p>
        <p className="muted">
          Override the global HTTP check defaults for this target only.{' '}
          <Link to="/plugins/check/http">Edit defaults</Link>.
        </p>

        <form className="form-col" onSubmit={onSave}>
          <label className="check-ids-item">
            <input
              type="checkbox"
              checked={useCustom}
              onChange={e => {
                const next = e.target.checked
                setUseCustom(next)
                setSaveMessage(null)
                setSaveError(null)
                if (!next) {
                  setTargetForm(defaultsForm)
                }
              }}
            />
            Use custom settings for this target
          </label>
          {!useCustom && (
            <p className="muted small">
              This target uses the default HTTP check parameters.
            </p>
          )}

          <HttpCheckFields
            idPrefix="target"
            form={targetForm}
            onChange={next => {
              setTargetForm(next)
              setSaveMessage(null)
              setSaveError(null)
            }}
            disabled={!useCustom}
          />

          <label>
            Test URL
            <input
              type="url"
              value={testUrl}
              onChange={e => setTestUrl(e.target.value)}
              placeholder="https://example.com/health"
              spellCheck={false}
            />
          </label>
          <button
            type="button"
            disabled={testing || !testUrl.trim()}
            onClick={() => void onTest()}
          >
            {testing ? 'Sending…' : 'Send test'}
          </button>
          {testError && <p className="error">{testError}</p>}
          {testResult && (
            <p className={testResult.ok ? 'ok-text' : 'error'}>
              {testResult.ok
                ? `Test passed (HTTP ${testResult.statusCode}, ${Math.round(testResult.latencyMs)}ms)`
                : `Test failed: ${testResult.error ?? 'unknown error'} (${Math.round(testResult.latencyMs)}ms)`}
            </p>
          )}

          <HttpCheckFootnotes />

          <div className="actions start">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={busy || !useCustom}
              onClick={() => void onClearOverride()}
            >
              Clear override
            </button>
          </div>
          {saveMessage && (
            <p className="ok-text" role="status">
              {saveMessage}
            </p>
          )}
          {saveError && (
            <p className="error" role="alert">
              {saveError}
            </p>
          )}
        </form>
      </section>
    </div>
  )
}
