import {useCallback, useEffect, useState, type FormEvent} from 'react'
import {Link, useParams} from 'react-router-dom'
import {
  api,
  isConfigurableNotifier,
  type ConfigurableNotifierId,
  type NotifierTargetConfigView,
  type NotifierTestResult,
} from '../api'

const WEBHOOK_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
] as const

interface TargetRef {
  id: number
  url: string
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strList(value: unknown): string {
  if (!Array.isArray(value)) return ''
  return value
    .map(v => (typeof v === 'string' ? v : ''))
    .filter(Boolean)
    .join('\n')
}

function parseList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function headersToText(headers: unknown): string {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers))
    return ''
  const keys = Object.keys(headers as Record<string, unknown>)
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
    if (typeof v !== 'string') throw new Error('headers values must be strings')
    out[k] = v
  }
  return out
}

function numList(value: unknown): number[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is number => typeof v === 'number')
}

function buildPayload(
  notifierId: ConfigurableNotifierId,
  useCustom: boolean,
  form: Record<string, unknown>,
): Record<string, unknown> {
  const base = {useCustom}
  switch (notifierId) {
    case 'webhook':
      return {
        ...base,
        url: str(form.url).trim(),
        method: str(form.method).trim() || 'POST',
        headers: parseHeadersText(str(form.headersText)),
      }
    case 'slack':
    case 'discord':
      return {
        ...base,
        webhookUrl: str(form.webhookUrl).trim(),
        username: str(form.username).trim() || 'UMPIRE',
      }
    case 'telegram':
      return {
        ...base,
        botToken: str(form.botToken).trim(),
        chatId: str(form.chatId).trim(),
        threadId: str(form.threadId).trim(),
      }
    case 'email':
      return {
        ...base,
        mode: form.mode === 'smtp' ? 'smtp' : 'sendmail',
        from: str(form.from).trim(),
        to: parseList(str(form.toText)),
        sendmailPath: str(form.sendmailPath).trim(),
        smtp: {
          host: str(form.smtpHost).trim(),
          port: Number(form.smtpPort) || 465,
          secure: form.smtpSecure !== false,
          username: str(form.smtpUsername).trim(),
          password: str(form.smtpPassword),
        },
      }
    case 'fcm':
      return {
        ...base,
        token_ids: numList(form.tokenIds),
      }
  }
}

function formFromEffective(
  notifierId: ConfigurableNotifierId,
  effective: Record<string, unknown>,
): Record<string, unknown> {
  switch (notifierId) {
    case 'webhook':
      return {
        url: str(effective.url),
        method: str(effective.method) || 'POST',
        headersText: headersToText(effective.headers),
      }
    case 'slack':
    case 'discord':
      return {
        webhookUrl: str(effective.webhookUrl),
        username: str(effective.username) || 'UMPIRE',
      }
    case 'telegram':
      return {
        botToken: str(effective.botToken),
        chatId: str(effective.chatId),
        threadId: str(effective.threadId),
      }
    case 'email': {
      const smtp =
        effective.smtp &&
        typeof effective.smtp === 'object' &&
        !Array.isArray(effective.smtp)
          ? (effective.smtp as Record<string, unknown>)
          : {}
      return {
        mode: effective.mode === 'smtp' ? 'smtp' : 'sendmail',
        from: str(effective.from),
        toText: strList(effective.to),
        sendmailPath: str(effective.sendmailPath),
        smtpHost: str(smtp.host),
        smtpPort: typeof smtp.port === 'number' ? smtp.port : 465,
        smtpSecure: smtp.secure !== false,
        smtpUsername: str(smtp.username),
        smtpPassword: str(smtp.password),
      }
    }
    case 'fcm':
      return {
        tokenIds: numList(effective.token_ids),
      }
  }
}

function NotifierCheckAllowlist({
  checks,
  checkIdsText,
  onChange,
}: {
  checks: Array<{id: string}>
  checkIdsText: string
  onChange: (next: string) => void
}) {
  const selectedChecks = parseList(checkIdsText)
  const toggleCheckId = (id: string) => {
    const next = selectedChecks.includes(id)
      ? selectedChecks.filter(x => x !== id)
      : [...selectedChecks, id]
    onChange(next.join('\n'))
  }

  if (checks.length === 0) return null

  return (
    <fieldset className="check-ids">
      <legend>Checks (optional allowlist)</legend>
      <div className="check-ids-list">
        {checks.map(c => (
          <label key={c.id} className="check-ids-item">
            <input
              type="checkbox"
              checked={selectedChecks.includes(c.id)}
              onChange={() => toggleCheckId(c.id)}
            />
            {c.id}
          </label>
        ))}
      </div>
      <p className="muted small">
        {selectedChecks.length === 0
          ? 'Any alert (including recovery).'
          : `Only failures of: ${selectedChecks.join(', ')} (no recovery)`}
      </p>
    </fieldset>
  )
}

function NotifierFields({
  notifierId,
  form,
  onChange,
  disabled,
  fcmDestinations = [],
}: {
  notifierId: ConfigurableNotifierId
  form: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  disabled: boolean
  fcmDestinations?: Array<{id: number; label: string; fid: string}>
}) {
  const set = (key: string, value: unknown) => onChange({...form, [key]: value})

  if (notifierId === 'fcm') {
    const tokenIds = numList(form.tokenIds)
    const toggleTokenId = (id: number) => {
      const next = tokenIds.includes(id)
        ? tokenIds.filter(x => x !== id)
        : [...tokenIds, id]
      set('tokenIds', next)
    }
    return (
      <>
        {fcmDestinations.length > 0 ? (
          <fieldset className="check-ids">
            <legend>Destinations (optional allowlist)</legend>
            <div className="check-ids-list fcm-destination-list">
              {fcmDestinations.map(d => (
                <label
                  key={d.id}
                  className="check-ids-item fcm-destination-item"
                >
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={tokenIds.includes(d.id)}
                    onChange={() => toggleTokenId(d.id)}
                  />
                  <span className="fcm-destination-text">
                    <span className="mono fcm-destination-id">#{d.id}</span>
                    {d.label ? (
                      <span>{d.label}</span>
                    ) : (
                      <span className="mono truncate" title={d.fid}>
                        {d.fid}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            <p className="muted small">
              {tokenIds.length === 0
                ? 'All enabled destinations.'
                : `Only: ${tokenIds.join(', ')}`}
            </p>
          </fieldset>
        ) : (
          <p className="muted">Add FCM destinations on the FCM page first.</p>
        )}
      </>
    )
  }

  if (notifierId === 'webhook') {
    return (
      <>
        <label>
          Method
          <select
            disabled={disabled}
            value={str(form.method) || 'POST'}
            onChange={e => set('method', e.target.value)}
          >
            {WEBHOOK_METHODS.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          URL
          <input
            type="url"
            disabled={disabled}
            value={str(form.url)}
            onChange={e => set('url', e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Headers (JSON object, optional)
          <textarea
            disabled={disabled}
            value={str(form.headersText)}
            onChange={e => set('headersText', e.target.value)}
            spellCheck={false}
          />
        </label>
      </>
    )
  }

  if (notifierId === 'slack' || notifierId === 'discord') {
    return (
      <>
        <label>
          Webhook URL
          <input
            type="url"
            disabled={disabled}
            value={str(form.webhookUrl)}
            onChange={e => set('webhookUrl', e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Username
          <input
            disabled={disabled}
            value={str(form.username)}
            onChange={e => set('username', e.target.value)}
          />
        </label>
      </>
    )
  }

  if (notifierId === 'telegram') {
    return (
      <>
        <label>
          Bot token
          <input
            disabled={disabled}
            value={str(form.botToken)}
            onChange={e => set('botToken', e.target.value)}
            spellCheck={false}
          />
        </label>
        <label>
          Chat ID
          <input
            disabled={disabled}
            value={str(form.chatId)}
            onChange={e => set('chatId', e.target.value)}
          />
        </label>
        <label>
          Thread ID (optional)
          <input
            disabled={disabled}
            value={str(form.threadId)}
            onChange={e => set('threadId', e.target.value)}
          />
        </label>
      </>
    )
  }

  return (
    <>
      <label>
        Mode
        <select
          disabled={disabled}
          value={form.mode === 'smtp' ? 'smtp' : 'sendmail'}
          onChange={e => set('mode', e.target.value)}
        >
          <option value="sendmail">sendmail</option>
          <option value="smtp">smtp</option>
        </select>
      </label>
      <label>
        From
        <input
          type="email"
          disabled={disabled}
          value={str(form.from)}
          onChange={e => set('from', e.target.value)}
        />
      </label>
      <label>
        To (one per line or comma-separated)
        <textarea
          disabled={disabled}
          value={str(form.toText)}
          onChange={e => set('toText', e.target.value)}
        />
      </label>
      <label>
        Sendmail path (optional)
        <input
          disabled={disabled}
          value={str(form.sendmailPath)}
          onChange={e => set('sendmailPath', e.target.value)}
        />
      </label>
      <label>
        SMTP host
        <input
          disabled={disabled}
          value={str(form.smtpHost)}
          onChange={e => set('smtpHost', e.target.value)}
        />
      </label>
      <label>
        SMTP port
        <input
          type="number"
          disabled={disabled}
          value={String(form.smtpPort ?? 465)}
          onChange={e => set('smtpPort', Number(e.target.value))}
        />
      </label>
      <label className="check-ids-item">
        <input
          type="checkbox"
          disabled={disabled}
          checked={form.smtpSecure !== false}
          onChange={e => set('smtpSecure', e.target.checked)}
        />
        SMTP secure (TLS)
      </label>
      <label>
        SMTP username
        <input
          disabled={disabled}
          value={str(form.smtpUsername)}
          onChange={e => set('smtpUsername', e.target.value)}
        />
      </label>
      <label>
        SMTP password
        <input
          type="password"
          disabled={disabled}
          value={str(form.smtpPassword)}
          onChange={e => set('smtpPassword', e.target.value)}
        />
      </label>
    </>
  )
}

export default function NotifierTargetOverride() {
  const {targetId: targetIdParam, notifierId: notifierIdParam} = useParams<{
    targetId: string
    notifierId: string
  }>()
  const targetId = Number(targetIdParam)
  const notifierId = notifierIdParam ?? ''

  const [target, setTarget] = useState<TargetRef | null>(null)
  const [defaultsForm, setDefaultsForm] = useState<Record<string, unknown>>({})
  const [targetForm, setTargetForm] = useState<Record<string, unknown>>({})
  const [useCustom, setUseCustom] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<NotifierTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [fcmDestinations, setFcmDestinations] = useState<
    Array<{id: number; label: string; fid: string}>
  >([])
  const [checks, setChecks] = useState<Array<{id: string}>>([])
  const [checkIdsText, setCheckIdsText] = useState('')
  const [loadedNotifiers, setLoadedNotifiers] = useState<string[]>([])

  const hasPluginConfig = isConfigurableNotifier(notifierId)
  const knownNotifier = loadedNotifiers.includes(notifierId) || hasPluginConfig

  const applyPluginView = useCallback(
    (view: NotifierTargetConfigView) => {
      if (!hasPluginConfig) return
      setUseCustom(view.useCustom)
      setDefaultsForm(formFromEffective(notifierId, view.defaults))
      setTargetForm(
        formFromEffective(
          notifierId,
          view.useCustom ? (view.override ?? view.effective) : view.effective,
        ),
      )
    },
    [hasPluginConfig, notifierId],
  )

  const load = useCallback(async () => {
    if (!Number.isFinite(targetId) || targetId <= 0 || !notifierId) {
      setError('Invalid target or notifier')
      setLoaded(true)
      return
    }

    const [targets, notifiers, checkPlugins, checkIds, pluginView, fcmTokens] =
      await Promise.all([
        api.targets.list(),
        api.notifiers.list(),
        api.checks.list(),
        api.targets.notifier.getCheckIds(notifierId, targetId),
        hasPluginConfig
          ? api.targets.notifier.getConfig(notifierId, targetId)
          : Promise.resolve(null),
        notifierId === 'fcm' ? api.tokens.list() : Promise.resolve([]),
      ])

    setLoadedNotifiers(notifiers.map(n => n.id))
    if (notifierId === 'fcm') {
      setFcmDestinations(fcmTokens)
    }
    setChecks(checkPlugins)
    setCheckIdsText(checkIds.check_ids.join('\n'))

    const selected = targets.find(t => t.id === targetId)
    if (!selected) {
      setError('Target not found')
      setLoaded(true)
      return
    }

    setTarget({id: selected.id, url: selected.url})
    if (pluginView) applyPluginView(pluginView)
    setLoaded(true)
  }, [applyPluginView, hasPluginConfig, notifierId, targetId])

  useEffect(() => {
    void load().catch(err =>
      setError(err instanceof Error ? err.message : String(err)),
    )
  }, [load])

  async function onSave(e: FormEvent) {
    e.preventDefault()
    if (!target || !knownNotifier) return
    setBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const savedChecks = await api.targets.notifier.putCheckIds(
        notifierId,
        target.id,
        parseList(checkIdsText),
      )
      setCheckIdsText(savedChecks.check_ids.join('\n'))
      if (hasPluginConfig) {
        const view = await api.targets.notifier.putConfig(
          notifierId,
          target.id,
          buildPayload(notifierId, useCustom, targetForm),
        )
        applyPluginView(view)
        setSaveMessage(
          view.useCustom
            ? `Saved — this target uses custom ${notifierId} settings`
            : savedChecks.check_ids.length > 0
              ? `Saved — check allowlist for ${notifierId} on this target`
              : `Saved — this target uses default ${notifierId} settings`,
        )
      } else {
        setSaveMessage(
          savedChecks.check_ids.length > 0
            ? `Saved — check allowlist for ${notifierId} on this target`
            : `Saved — ${notifierId} receives any alert for this target`,
        )
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onClearOverride() {
    if (!target || !knownNotifier) return
    setBusy(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      await api.targets.notifier.putCheckIds(notifierId, target.id, [])
      setCheckIdsText('')
      if (hasPluginConfig) {
        const view = await api.targets.notifier.clearConfig(
          notifierId,
          target.id,
        )
        applyPluginView(view)
      }
      setSaveMessage(
        `Override cleared — target uses default ${notifierId} settings`,
      )
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onTest() {
    if (!target || !hasPluginConfig) return
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.targets.notifier.test(
        notifierId,
        target.id,
        buildPayload(notifierId, useCustom, targetForm),
      )
      setTestResult(result)
    } catch (err) {
      setTestResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setTesting(false)
    }
  }

  if (!loaded && !error) return <p className="muted">Loading…</p>

  if (!knownNotifier && loaded) {
    return (
      <div className="stack">
        <p className="error">
          Notifier &quot;{notifierId}&quot; is not loaded.
        </p>
        <Link to="/targets">Back to targets</Link>
      </div>
    )
  }

  if (error && !target) {
    return (
      <div className="stack">
        <p className="error">{error}</p>
        <Link to="/targets">Back to targets</Link>
      </div>
    )
  }

  const defaultsPath = `/plugins/notify/${notifierId}`
  const fcmDestinationsPath = '/plugins/notify/fcm'

  return (
    <div className="stack">
      <section className="panel">
        <p className="muted">
          <Link to="/targets">Targets</Link>
          {hasPluginConfig ? (
            <>
              {' · '}
              {notifierId === 'fcm' ? (
                <Link to={fcmDestinationsPath}>Manage FCM destinations</Link>
              ) : (
                <Link to={defaultsPath}>{notifierId} defaults</Link>
              )}
            </>
          ) : null}
        </p>
        <h2>
          {notifierId} notifier — target #{target!.id}
        </h2>
        <p className="mono">{target!.url}</p>
        <p className="muted">
          {hasPluginConfig ? (
            notifierId === 'fcm' ? (
              <>
                Optionally restrict which FCM destinations receive this
                target&apos;s alerts.{' '}
                <Link to={fcmDestinationsPath}>Manage destinations</Link>. Check
                filtering is configured below (core).
              </>
            ) : (
              <>
                Override global {notifierId} defaults for this target only.{' '}
                <Link to={defaultsPath}>Edit defaults</Link>. Check filtering is
                configured below (core).
              </>
            )
          ) : (
            <>
              Restrict which check failures trigger this notifier for this
              target. Empty = any alert (including recovery).
            </>
          )}
        </p>

        <form className="form-col" onSubmit={onSave}>
          {hasPluginConfig ? (
            <>
              <label className="check-ids-item">
                <input
                  type="checkbox"
                  checked={useCustom}
                  onChange={e => {
                    const next = e.target.checked
                    setUseCustom(next)
                    setSaveMessage(null)
                    setSaveError(null)
                    if (!next) setTargetForm(defaultsForm)
                  }}
                />
                Use custom settings for this target
              </label>
              {!useCustom && (
                <p className="muted small">
                  This target uses the default {notifierId} notifier parameters.
                </p>
              )}
              <NotifierFields
                notifierId={notifierId}
                form={targetForm}
                onChange={next => {
                  setTargetForm(next)
                  setSaveMessage(null)
                  setSaveError(null)
                }}
                disabled={!useCustom}
                fcmDestinations={fcmDestinations}
              />
              <button
                type="button"
                disabled={testing}
                onClick={() => void onTest()}
              >
                {testing ? 'Sending…' : 'Send test'}
              </button>
              {testResult && (
                <p className={testResult.ok ? 'ok-text' : 'error'}>
                  {testResult.ok
                    ? 'Test notification sent'
                    : `Test failed: ${testResult.error ?? 'unknown error'}`}
                </p>
              )}
            </>
          ) : null}

          <NotifierCheckAllowlist
            checks={checks}
            checkIdsText={checkIdsText}
            onChange={next => {
              setCheckIdsText(next)
              setSaveMessage(null)
              setSaveError(null)
            }}
          />

          <div className="actions start">
            <button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={
                busy || (!useCustom && parseList(checkIdsText).length === 0)
              }
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
